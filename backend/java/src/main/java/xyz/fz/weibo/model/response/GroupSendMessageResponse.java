package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

public record GroupSendMessageResponse(
        boolean result,
        @JsonAlias({"id", "mid"}) Long mid,
        Long gid,
        String content,
        @JsonProperty("media_type") Integer mediaType,
        Long time,
        Long ts) {}
