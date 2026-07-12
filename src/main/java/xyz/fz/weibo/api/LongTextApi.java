package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.response.LongTextResponse;

/**
 * 长文接口。
 */
@Component
public class LongTextApi {

    private static final String LONG_TEXT_URL = "https://weibo.com/ajax/statuses/longtext";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public LongTextApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public LongTextResponse longText(LongTextRequest request) {
        ResponseEntity<String> resp = client.getForString(
                LONG_TEXT_URL, request.toParams(), WeiboConstants.HEADERS_AJAX, true);
        try {
            return objectMapper.readValue(resp.getBody(), LongTextResponse.class);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }
}
