package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 微博条目结构，列表与长文接口共享。
 */
public record Mblog(
        Long id,
        String mblogid,
        @JsonProperty("created_at") String createdAt,
        String text,
        String source,
        @JsonProperty("isLongText") boolean isLongText,
        @JsonProperty("pic_num") int picNum
) {
}
