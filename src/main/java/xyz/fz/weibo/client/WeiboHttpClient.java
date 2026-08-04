package xyz.fz.weibo.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.client.exception.WeiboUriTooLongException;

import java.net.URI;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * 微博 HTTP 客户端：封装 GET 请求的统一状态码判定与限流重试。
 * <p>
 * 公共错误由状态码驱动：429 退避重试，414 立即失败，302 按是否跳登录域判定 Cookie 失效，
 * 200 且 String 响应时按 body 校验 21301/relogin!。byte[] 响应（媒体下载）不检查 body。
 */
@Component
public class WeiboHttpClient {

    private static final Logger log = LoggerFactory.getLogger(WeiboHttpClient.class);

    private final RestTemplate restTemplate;
    private final WeiboCookieHolder cookieHolder;
    private final ObjectMapper objectMapper;

    public WeiboHttpClient(RestTemplate restTemplate, WeiboCookieHolder cookieHolder, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.cookieHolder = cookieHolder;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<String> getForString(String url, Map<String, String> params,
                                               Map<String, String> headers, boolean withCookie) {
        URI uri = buildUri(url, params);
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        return get0(uri, httpHeaders, String.class);
    }

    public ResponseEntity<byte[]> getForBytes(String url, Map<String, String> params,
                                              Map<String, String> headers, boolean withCookie) {
        URI uri = buildUri(url, params);
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        return get0(uri, httpHeaders, byte[].class);
    }

    public ResponseEntity<String> postForm(String url, Map<String, String> params,
                                            Map<String, String> headers, boolean withCookie) {
        URI uri = buildUri(url, null);
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
        return post0(uri, new HttpEntity<>(form, httpHeaders), String.class);
    }

    /**
     * multipart/form-data POST：file part 用 ByteArrayResource 包装（带 filename），不落临时文件。
     * <p>
     * 与 postForm 的区别：queryParams 进 URL（如 uploadx.json 的 source/is_chunk/selectId），
     * body 为 MultiValueMap（含 file part 与普通字段）。
     */
    public ResponseEntity<String> postMultipart(String url, Map<String, String> queryParams,
                                                 MultiValueMap<String, Object> body,
                                                 Map<String, String> headers, boolean withCookie) {
        URI uri = buildUri(url, queryParams);
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        httpHeaders.setContentType(MediaType.MULTIPART_FORM_DATA);
        return post0(uri, new HttpEntity<>(body, httpHeaders), String.class);
    }

    /**
     * application/octet-stream POST：body 为原始分片二进制（如视频分片上传）。
     * <p>
     * 与 postMultipart 的区别：queryParams 进 URL（如 name/chunk/chunks/selectId），
     * body 为 byte[]，非 multipart；Content-Type 固定为 application/octet-stream。
     * 动态 header（如 X-Up-Auth）由调用方放入 headers。
     */
    public ResponseEntity<String> postOctetStream(String url, Map<String, String> queryParams,
                                                  byte[] body,
                                                  Map<String, String> headers, boolean withCookie) {
        URI uri = buildUri(url, queryParams);
        HttpHeaders httpHeaders = buildHeaders(headers, withCookie);
        httpHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        return post0(uri, new HttpEntity<>(body, httpHeaders), String.class);
    }

    public <T> T getForStream(String url, Map<String, String> params,
                              Map<String, String> headers, boolean withCredential,
                              ResponseExtractor<T> responseExtractor) {
        URI uri = buildUri(url, params);
        HttpHeaders httpHeaders = buildHeaders(headers, withCredential);
        return request0(uri, httpHeaders,
                () -> restTemplate.execute(uri, HttpMethod.GET,
                        request -> request.getHeaders().putAll(httpHeaders),
                        response -> {
                            int statusCode = response.getStatusCode().value();
                            log.debug("微博响应：{} status={}", uri, statusCode);
                            checkRateLimit(statusCode);
                            checkResponseStatus(statusCode, response.getHeaders(), uri);
                            return responseExtractor.extractData(response);
                        }));
    }

    /**
     * 重试循环：attempt 从 1 到 MAX_RETRY+1，即 1 次初始加最多 3 次重试，合计 4 次请求。
     */
    private <T> ResponseEntity<T> get0(URI uri, HttpHeaders headers, Class<T> responseType) {
        return exchangeAndCheck(uri, HttpMethod.GET, new HttpEntity<>(headers), responseType);
    }

    private <T> ResponseEntity<T> post0(URI uri, HttpEntity<?> entity, Class<T> responseType) {
        return exchangeAndCheck(uri, HttpMethod.POST, entity, responseType);
    }

    private <T> ResponseEntity<T> exchangeAndCheck(URI uri, HttpMethod method,
                                                    HttpEntity<?> entity, Class<T> responseType) {
        return request0(uri, entity.getHeaders(), () -> {
            ResponseEntity<T> resp = restTemplate.exchange(uri, method, entity, responseType);
            int statusCode = resp.getStatusCode().value();
            log.debug("微博响应：{} status={} body={}", uri, statusCode, previewBody(resp.getBody()));
            checkRateLimit(statusCode);
            checkResponseStatus(statusCode, resp.getHeaders(), uri);
            if (statusCode == 200 && responseType == String.class) {
                checkCookieExpiredByBody((String) resp.getBody());
            }
            return resp;
        });
    }

    private <T> T request0(URI uri, HttpHeaders headers, Supplier<T> request) {
        //noinspection ConstantValue
        for (int attempt = 1; attempt <= WeiboConstants.MAX_RETRY + 1; attempt++) {
            try {
                log.debug("微博请求：{} headers={}", uri, maskCookie(headers));
                return request.get();
            } catch (RateLimitedResponseException e) {
                if (attempt <= WeiboConstants.MAX_RETRY) {
                    long backoff = (long) Math.pow(4, attempt) * 1000L;
                    log.warn("微博接口限流（429），第 {} 次重试前等待 {} ms：{}", attempt, backoff, uri);
                    sleep(backoff);
                    continue;
                }
                throw new WeiboRateLimitException(
                        "微博接口限流，重试 " + WeiboConstants.MAX_RETRY + " 次仍失败：" + uri);
            }
        }
        throw new WeiboException("请求重试循环异常退出：" + uri);
    }

    private void checkRateLimit(int statusCode) {
        if (statusCode == 429) {
            throw new RateLimitedResponseException();
        }
    }

    private void checkResponseStatus(int statusCode, HttpHeaders responseHeaders, URI uri) {
        if (statusCode == 414) {
            throw new WeiboUriTooLongException("URI 过长（414）：" + uri);
        }
        if (statusCode == 302) {
            String location = responseHeaders.getFirst(HttpHeaders.LOCATION);
            if (location != null
                    && Pattern.compile(WeiboConstants.LOGIN_DOMAIN_REGEX).matcher(location).find()) {
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

    /**
     * 校验 String body 是否为登录失效 JSON（error_code=21301 或 error=relogin!）。
     * JsonProcessingException 时跳过，兼容 JSONP 等非 JSON 响应。
     */
    private void checkCookieExpiredByBody(String body) {
        if (body == null || body.isEmpty()) {
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root != null && root.isObject()) {
                JsonNode errorCode = root.get("error_code");
                if (errorCode != null && errorCode.asInt() == 21301) {
                    throw new WeiboCookieExpiredException("Cookie 失效：error_code=21301, error=relogin!");
                }
                JsonNode error = root.get("error");
                if (error != null && "relogin!".equals(error.asText())) {
                    throw new WeiboCookieExpiredException("Cookie 失效：error=relogin!");
                }
            }
        } catch (JsonProcessingException e) {
            // 非 JSON 响应（如 JSONP），忽略
        }
    }

    /** Cookie 脱敏：只保留 key 和值长度，避免日志泄露完整凭证。 */
    private String maskCookie(HttpHeaders headers) {
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
            sb.append(name).append("=").repeat("*", Math.min(value.length(), 6)).append("(").append(value.length()).append(")");
        }
        return sb.append("}").toString();
    }

    /** 响应预览：String 截断到 500 字符，byte[] 只显示长度。 */
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
