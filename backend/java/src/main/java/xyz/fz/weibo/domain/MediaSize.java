package xyz.fz.weibo.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

public record MediaSize(
        String url,
        @JsonProperty("w") int width,
        @JsonProperty("h") int height
) {
}
