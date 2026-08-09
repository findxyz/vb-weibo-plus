package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.response.LongTextResponse;

/**
 * 长文接口。
 */
@Component
public class LongTextApi {

    private static final Logger log = LoggerFactory.getLogger(LongTextApi.class);

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
            // 长文是辅助内容，解析失败（如微博返回 HTML 而非 JSON）不应让整条微博同步失败：
            // 记录原始响应供排查，按「无长文」处理，正文回退到微博列表里的短文本。
            log.warn("长文响应非 JSON，按无长文处理：mblogId = {}，原始响应 = {}，解析错误 = {}",
                    request.id(), resp.getBody(), e.getMessage());
            return new LongTextResponse(null, 1);
        }
    }
}
