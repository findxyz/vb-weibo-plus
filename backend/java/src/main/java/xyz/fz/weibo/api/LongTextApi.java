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
        ResponseEntity<String> resp =
                client.getForString(
                        LONG_TEXT_URL, request.toParams(), WeiboConstants.HEADERS_AJAX, true);
        try {
            return objectMapper.readValue(resp.getBody(), LongTextResponse.class);
        } catch (JsonProcessingException e) {
            log.atWarn()
                    .addArgument(request::id)
                    .addArgument(resp::getBody)
                    .addArgument(e::getMessage)
                    .log("长文响应非 JSON，按无长文处理：mblogId = {}，原始响应 = {}，解析错误 = {}");
            return new LongTextResponse(null, 1);
        }
    }
}
