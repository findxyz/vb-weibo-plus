package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 群聊消息响应。
 */
public record GroupMessagesResponse(
        boolean result,
        List<Message> messages,
        long ts
) {

    public record Message(
            Long id,
            Long gid,
            int type,
            @JsonProperty("from_uid") Long fromUid,
            String content,
            @JsonProperty("media_type") int mediaType,
            long time
    ) {
    }
}
