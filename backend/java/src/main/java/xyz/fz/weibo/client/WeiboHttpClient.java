package xyz.fz.weibo.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResponseExtractor;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.client.exception.WeiboUriTooLongException;

@Component
public class WeiboHttpClient {

    private static final Logger log = LoggerFactory.getLogger(WeiboHttpClient.class);

    private final RestTemplate restTemplate;
    private final WeiboCookieHolder cookieHolder;
    private final ObjectMapper objectMapper;

    public WeiboHttpClient(
            RestTemplate restTemplate, WeiboCookieHolder cookieHolder, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.cookieHolder = cookieHolder;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<String> getForString(
            String url,
            Map<String, String> params,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, params);
        HttpEntity<?> entity = new HttpEntity<>(buildHeaders(headers, withCookie));
        return withRateLimitRetry(
                uri,
                entity.getHeaders(),
                () -> executeAndCheck(uri, HttpMethod.GET, entity, String.class));
    }

    public ResponseEntity<byte[]> getForBytes(
            String url,
            Map<String, String> params,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, params);
        HttpEntity<?> entity = new HttpEntity<>(buildHeaders(headers, withCookie));
        return withRateLimitRetry(
                uri,
                entity.getHeaders(),
                () -> executeAndCheck(uri, HttpMethod.GET, entity, byte[].class));
    }

    public ResponseEntity<String> postForm(
            String url,
            Map<String, String> params,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, null);
        HttpEntity<?> entity = formEntity(params, headers, withCookie);
        return withRateLimitRetry(
                uri,
                entity.getHeaders(),
                () -> executeAndCheck(uri, HttpMethod.POST, entity, String.class));
    }

    public ResponseEntity<String> postFormOnce(
            String url,
            Map<String, String> params,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, null);
        try {
            return executeAndCheck(
                    uri, HttpMethod.POST, formEntity(params, headers, withCookie), String.class);
        } catch (RateLimitedResponseException e) {
            throw new WeiboRateLimitException("微博接口限流，请稍后重试。", e);
        } catch (RestClientException e) {
            throw new WeiboException("微博请求超时或连接失败，请稍后重试。", -1, e);
        }
    }

    private HttpEntity<?> formEntity(
            Map<String, String> params, Map<String, String> headers, boolean withCookie) {
        @SuppressWarnings("PMD.LooseCoupling")
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        httpHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        if (params != null) {
            for (Map.Entry<String, String> entry : params.entrySet()) {
                String value = entry.getValue();
                if (value == null || value.isEmpty()) {
                    continue;
                }
                form.add(entry.getKey(), value);
            }
        }
        return new HttpEntity<>(form, httpHeaders);
    }

    public ResponseEntity<String> postMultipart(
            String url,
            Map<String, String> queryParams,
            MultiValueMap<String, Object> body,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, queryParams);
        @SuppressWarnings("PMD.LooseCoupling")
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        httpHeaders.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<?> entity = new HttpEntity<>(body, httpHeaders);
        return withRateLimitRetry(
                uri,
                httpHeaders,
                () -> executeAndCheck(uri, HttpMethod.POST, entity, String.class));
    }

    public ResponseEntity<String> postOctetStream(
            String url,
            Map<String, String> queryParams,
            byte[] body,
            Map<String, String> headers,
            boolean withCookie) {
        URI uri = buildUri(url, queryParams);
        @SuppressWarnings("PMD.LooseCoupling")
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        httpHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        HttpEntity<?> entity = new HttpEntity<>(body, httpHeaders);
        return withRateLimitRetry(
                uri,
                httpHeaders,
                () -> executeAndCheck(uri, HttpMethod.POST, entity, String.class));
    }

    public <T> T getForStream(
            String url,
            Map<String, String> params,
            Map<String, String> headers,
            boolean withCredential,
            ResponseExtractor<T> responseExtractor) {
        URI uri = buildUri(url, params);
        @SuppressWarnings("PMD.LooseCoupling")
        HttpHeaders httpHeaders = buildHeaders(headers, withCredential);
        return withRateLimitRetry(
                uri,
                httpHeaders,
                () ->
                        restTemplate.execute(
                                uri,
                                HttpMethod.GET,
                                request -> request.getHeaders().putAll(httpHeaders),
                                response -> {
                                    int statusCode = response.getStatusCode().value();
                                    log.debug("微博响应：{} status={}", uri, statusCode);
                                    checkRateLimit(statusCode);
                                    checkResponseStatus(statusCode, response.getHeaders(), uri);
                                    return responseExtractor.extractData(response);
                                }));
    }

    private <T> ResponseEntity<T> executeAndCheck(
            URI uri, HttpMethod method, HttpEntity<?> entity, Class<T> responseType) {
        ResponseEntity<T> resp = restTemplate.exchange(uri, method, entity, responseType);
        int statusCode = resp.getStatusCode().value();
        if (log.isDebugEnabled()) {
            log.debug("微博响应：{} status={} body={}", uri, statusCode, previewBody(resp.getBody()));
        }
        checkRateLimit(statusCode);
        checkResponseStatus(statusCode, resp.getHeaders(), uri);
        if (statusCode == 200 && responseType == String.class) {
            checkCookieExpiredByBody((String) resp.getBody());
        }
        return resp;
    }

    @SuppressWarnings("ConstantValue")
    private <T> T withRateLimitRetry(
            URI uri,
            @SuppressWarnings("PMD.LooseCoupling") HttpHeaders headers,
            Supplier<T> request) {
        for (int attempt = 1; attempt <= WeiboConstants.MAX_RETRY + 1; attempt++) {
            try {
                if (log.isDebugEnabled()) {
                    log.debug("微博请求：{} headers={}", uri, maskCookie(headers));
                }
                return request.get();
            } catch (RateLimitedResponseException e) {
                if (attempt <= WeiboConstants.MAX_RETRY) {
                    long backoff = (long) Math.pow(4, attempt) * 1000L;
                    log.warn("微博接口限流（429），第 {} 次重试前等待 {} ms：{}", attempt, backoff, uri);
                    sleep(backoff);
                    continue;
                }
                throw new WeiboRateLimitException(
                        "微博接口限流，重试 " + WeiboConstants.MAX_RETRY + " 次仍失败：" + uri, e);
            }
        }
        throw new WeiboException("请求重试循环异常退出：" + uri);
    }

    private void checkRateLimit(int statusCode) {
        if (statusCode == 429) {
            throw new RateLimitedResponseException();
        }
    }

    private void checkResponseStatus(
            int statusCode,
            @SuppressWarnings("PMD.LooseCoupling") HttpHeaders responseHeaders,
            URI uri) {
        if (statusCode == 414) {
            throw new WeiboUriTooLongException("URI 过长（414）：" + uri);
        }
        if (statusCode == 302) {
            String location = responseHeaders.getFirst(HttpHeaders.LOCATION);
            if (location != null
                    && Pattern.compile(WeiboConstants.LOGIN_DOMAIN_REGEX)
                            .matcher(location)
                            .find()) {
                throw new WeiboCookieExpiredException("Credential 失效，302 跳转登录：" + location);
            }
            throw new WeiboException("非预期的 302 重定向：" + location);
        }
    }

    private static final class RateLimitedResponseException extends RuntimeException {
        private RateLimitedResponseException() {
            super(null, null, false, false);
        }
    }

    private URI buildUri(String url, Map<String, String> params) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(url);
        if (params != null) {
            for (Map.Entry<String, String> entry : params.entrySet()) {
                String value = entry.getValue();
                if (value == null || value.isEmpty()) {
                    continue;
                }
                builder.queryParam(entry.getKey(), value);
            }
        }
        return builder.build().encode().toUri();
    }

    @SuppressWarnings("PMD.LooseCoupling")
    private HttpHeaders buildHeaders(Map<String, String> headers, boolean withCookie) {
        HttpHeaders httpHeaders = new HttpHeaders();
        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                httpHeaders.set(entry.getKey(), entry.getValue());
            }
        }
        if (withCookie) {
            String cookie = cookieHolder.get();
            if (cookie == null || cookie.isEmpty()) {
                throw new WeiboCookieExpiredException("未登录，无可用 Cookie");
            }
            httpHeaders.set(HttpHeaders.COOKIE, cookie);
        }
        return httpHeaders;
    }

    private void checkCookieExpiredByBody(String body) {
        if (body == null || body.isEmpty()) {
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root != null && root.isObject()) {
                JsonNode errorCode = root.get("error_code");
                if (errorCode != null && errorCode.asInt() == 21301) {
                    throw new WeiboCookieExpiredException(
                            "Cookie 失效：error_code=21301, error=relogin!");
                }
                JsonNode error = root.get("error");
                if (error != null && "relogin!".equals(error.asText())) {
                    throw new WeiboCookieExpiredException("Cookie 失效：error=relogin!");
                }
            }
        } catch (JsonProcessingException e) {
            return;
        }
    }

    private String maskCookie(@SuppressWarnings("PMD.LooseCoupling") HttpHeaders headers) {
        String cookie = headers.getFirst(HttpHeaders.COOKIE);
        if (cookie == null || cookie.isEmpty()) {
            return "{}";
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (String pair : cookie.split(";")) {
            String trimmed = pair.trim();
            int eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String name = trimmed.substring(0, eq);
            String value = trimmed.substring(eq + 1);
            if (!first) {
                sb.append(", ");
            }
            first = false;
            sb.append(name)
                    .append("=")
                    .repeat("*", Math.min(value.length(), 6))
                    .append("(")
                    .append(value.length())
                    .append(")");
        }
        return sb.append("}").toString();
    }

    private String previewBody(Object body) {
        if (body == null) {
            return "null";
        }
        if (body instanceof byte[] bytes) {
            return "<byte[" + bytes.length + "]>";
        }
        String text = body.toString();
        return text.length() <= 500 ? text : text.substring(0, 500) + "...(" + text.length() + ")";
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WeiboException("限流重试等待被中断", e);
        }
    }
}
