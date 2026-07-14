package xyz.fz.weibo.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record RetweetInfo(
        @JsonProperty("post_id") long postId,
        @JsonProperty("mblogid") String mblogId,
        String content,
        @JsonProperty("content_raw") String contentRaw,
        long uid,
        @JsonProperty("screen_name") String screenName,
        @JsonProperty("created_at") long createdAt,
        List<PicInfo> pics,
        @JsonProperty("video_cover_url") String videoCoverUrl,
        @JsonProperty("video_page_url") String videoPageUrl
) {
}
