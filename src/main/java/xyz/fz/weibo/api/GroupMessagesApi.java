package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.request.GroupSendMessageRequest;
import xyz.fz.weibo.model.response.GroupMessagesResponse;
import xyz.fz.weibo.model.response.GroupSendMessageResponse;

/**
 * 群聊消息接口。
 */
@Component
public class GroupMessagesApi {

    private static final String GROUP_MESSAGES_URL = "https://api.weibo.com/webim/groupchat/query_messages.json";
    private static final String SEND_MESSAGE_URL = "https://api.weibo.com/webim/groupchat/send_message.json";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public GroupMessagesApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public GroupMessagesResponse messages(GroupMessagesRequest request) {
        ResponseEntity<String> resp = client.getForString(
                GROUP_MESSAGES_URL, request.toParams(), WeiboConstants.HEADERS_WEBIM, true);
        try {
            return objectMapper.readValue(resp.getBody(), GroupMessagesResponse.class);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }

    public GroupSendMessageResponse send(GroupSendMessageRequest request) {
        ResponseEntity<String> resp = client.postForm(
                SEND_MESSAGE_URL, request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true);
        try {
            return objectMapper.readValue(resp.getBody(), GroupSendMessageResponse.class);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }
}
