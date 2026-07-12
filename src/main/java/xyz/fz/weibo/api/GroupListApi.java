package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupListRequest;
import xyz.fz.weibo.model.response.GroupListResponse;

/**
 * 群聊列表接口。
 */
@Component
public class GroupListApi {

    private static final String GROUP_LIST_URL = "https://api.weibo.com/webim/2/direct_messages/contacts.json";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public GroupListApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public GroupListResponse list() {
        ResponseEntity<String> resp = client.getForString(
                GROUP_LIST_URL, new GroupListRequest().toParams(), WeiboConstants.HEADERS_WEBIM, true);
        try {
            return objectMapper.readValue(resp.getBody(), GroupListResponse.class);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }
}
