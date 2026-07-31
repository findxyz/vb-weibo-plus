package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 群聊消息发送响应。
 * <p>
 * result 为 true 表示发送成功；mid 为新消息 id；time 为秒级时间戳。
 */
public record GroupSendMessageResponse(
        boolean result,
        @JsonAlias({"id", "mid"}) Long mid,
        Long gid,
        String content,
        @JsonProperty("media_type") Integer mediaType,
        Long time,
        Long ts
) {
}
