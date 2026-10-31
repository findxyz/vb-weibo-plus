package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriUtils;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.domain.PostLikeState;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.net.HttpCookie;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PostLikeApi {

    private static final String STATUS_URL = "https://weibo.com/ajax/statuses/";

    private final WeiboHttpClient client;
    private final WeiboCookieHolder credential;
    private final ObjectMapper objectMapper;

    public PostLikeApi(WeiboHttpClient client, WeiboCookieHolder credential, ObjectMapper objectMapper) {
        this.client = client;
        this.credential = credential;
        this.objectMapper = objectMapper;
    }

    public PostLikeState query(long id) {
        requireId(id);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", Long.toString(id));
        params.put("locale", "zh-CN");
        JsonNode body = requireSuccess(client.getForString(
                STATUS_URL + "show", params, WeiboConstants.HEADERS_AJAX, true));
        JsonNode status = body.path("attitudes_status");
        JsonNode count = body.path("attitudes_count");
        if (!Long.toString(id).equals(body.path("idstr").asText())
                || !status.isIntegralNumber() || !status.canConvertToInt()
                || (status.intValue() != 0 && status.intValue() != 1)
                || !count.isIntegralNumber() || !count.canConvertToInt() || count.intValue() < 0) {
            throw new WeiboException("微博点赞状态不完整，请重试。", -1);
        }
        return new PostLikeState(status.intValue() == 1, count.intValue());
    }

    public void setLike(long id, boolean liked) {
        requireId(id);
        String current = credential.get();
        if (current == null || current.isBlank()) {
            throw new WeiboCookieExpiredException("未登录，请扫码登录后重试。");
        }
        Map<String, String> headers = new LinkedHashMap<>(WeiboConstants.HEADERS_AJAX);
        headers.put(HttpHeaders.COOKIE, current);
        ResponseEntity<String> page = client.getForString("https://weibo.com/", null, headers, false);
        Map<String, String> cookies = new LinkedHashMap<>();
        for (String value : page.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)) {
            for (HttpCookie cookie : HttpCookie.parse(value)) {
                if (cookie.getName().equals("XSRF-TOKEN") || cookie.getName().equals("WBPSESS")) {
                    cookies.put(cookie.getName(), cookie.getValue());
                }
            }
        }
        if (page.getStatusCode().value() != 200 || !cookies.containsKey("XSRF-TOKEN")) {
            throw new WeiboException("无法获取微博点赞验证信息，请重新登录后重试。", -1);
        }
        StringBuilder cookieHeader = new StringBuilder(current);
        cookies.forEach((name, value) -> cookieHeader.append("; ").append(name).append('=').append(value));
        headers.put(HttpHeaders.COOKIE, cookieHeader.toString());
        headers.put(HttpHeaders.ORIGIN, "https://weibo.com");
        headers.put("X-XSRF-TOKEN", UriUtils.decode(cookies.get("XSRF-TOKEN"), StandardCharsets.UTF_8));
        requireSuccess(client.postFormOnce(STATUS_URL + (liked ? "setLike" : "cancelLike"),
                Map.of("id", Long.toString(id)), headers, false));
    }

    private void requireId(long id) {
        if (id <= 0) {
            throw new InvalidRequestException("微博数字 ID 必须大于 0。");
        }
    }

    private JsonNode requireSuccess(ResponseEntity<String> response) {
        try {
            JsonNode body = response.getBody() == null ? null : objectMapper.readTree(response.getBody());
            if (response.getStatusCode().value() != 200 || body == null || body.path("ok").asInt() <= 0) {
                int code = body == null ? -1 : body.path("error_code").asInt(-1);
                if (code == 20062 || code == 20067) {
                    throw new WeiboException("微博要求安全验证，请前往微博网页版完成验证后重试。", code);
                }
                throw new WeiboException("微博点赞接口请求失败，请稍后重试。", -1);
            }
            return body;
        } catch (JsonProcessingException e) {
            throw new WeiboException("微博点赞接口返回无效响应，请稍后重试。", -1, e);
        }
    }
}
