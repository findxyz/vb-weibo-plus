package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
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
}
