package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GroupVideoUploadInitResponse(
        String fileToken,
        String auth,
        int length,
        @JsonProperty("media_id") String mediaId) {
}
