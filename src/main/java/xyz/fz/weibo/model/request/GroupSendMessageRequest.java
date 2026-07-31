package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊文字消息发送请求参数。
 * <p>
 * id 为群 gid，content 为消息正文，source 固定。
 */
public record GroupSendMessageRequest(Long id, String content) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id == null ? null : id.toString());
        params.put("content", content);
        params.put("source", "209678993");
        return params;
    }
}
