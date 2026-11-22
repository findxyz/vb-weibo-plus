package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResponseExtractor;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;

@Component
public class PostDetailApi {

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public PostDetailApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    ResponseEntity<String> get(String id) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id);
        params.put("locale", "zh-CN");
        return client.getForString(
                "https://weibo.com/ajax/statuses/show", params, WeiboConstants.HEADERS_AJAX, true);
    }

    public JsonNode query(String id) {
        ResponseEntity<String> response = get(id);
        try {
            JsonNode body =
                    response.getBody() == null ? null : objectMapper.readTree(response.getBody());
            if (!response.getStatusCode().is2xxSuccessful()
                    || body == null
                    || body.path("ok").asInt() <= 0
                    || !id.equals(body.path("idstr").asText())) {
                throw new WeiboException("微博详情暂不可用。", -1);
            }
            return body;
        } catch (JsonProcessingException e) {
            throw new WeiboException("微博详情暂不可用。", -1, e);
        }
    }

    public <T> T streamVideo(String id, String range, ResponseExtractor<T> extractor) {
        JsonNode detail = query(id);
        URI source = videoSource(detail.path("page_info"));
        if (source == null) {
            for (JsonNode item : detail.path("mix_media_info").path("items")) {
                if ("video".equals(item.path("type").asText())) {
                    source = videoSource(item.path("data"));
                    if (source != null) {
                        break;
                    }
                }
            }
        }
        if (source == null) {
            throw new WeiboException("该微博没有可播放的视频。", -1);
        }
        Map<String, String> headers = new LinkedHashMap<>(WeiboConstants.HEADERS_DIRECT);
        headers.put(HttpHeaders.ACCEPT_ENCODING, "identity");
        if (range != null) {
            headers.put(HttpHeaders.RANGE, range);
        }
        return client.getForStream(source, headers, false, extractor);
    }

    private URI videoSource(JsonNode page) {
        for (JsonNode playback : page.path("media_info").path("playback_list")) {
            URI uri = cdnVideo(playback.path("play_info").path("url").asText());
            if (uri != null) {
                return uri;
            }
        }
        return null;
    }

    private URI cdnVideo(String value) {
        try {
            URI uri = URI.create(value);
            if ("https".equalsIgnoreCase(uri.getScheme())
                    && uri.getHost() != null
                    && uri.getHost().toLowerCase(Locale.ROOT).endsWith(".weibocdn.com")
                    && uri.getUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && uri.getPath().toLowerCase(Locale.ROOT).endsWith(".mp4")) {
                return uri;
            }
        } catch (IllegalArgumentException ignored) {
            return null;
        }
        return null;
    }
}
