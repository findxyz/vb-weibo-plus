package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 群聊发送视频：初始化视频响应（webim/2/multimedia/init.json）。
 * <p>
 * fileToken 为本次视频上传的动态令牌，auth 为分片上传的动态鉴权（用于 X-Up-Auth），
 * length 为分片大小（KB），mediaId 为媒体 id（响应字段为 media_id，snake_case）。
 * 其余字段（threads/chunk_retry 等）忽略。
 */
public record GroupVideoUploadInitResponse(
        String fileToken,
        String auth,
        int length,
        @JsonProperty("media_id") String mediaId) {
}
