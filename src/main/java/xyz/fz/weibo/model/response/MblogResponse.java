package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;

/**
 * 微博条目结构，列表与长文接口共享。
 */
public record MblogResponse(
        Long id,
        @JsonProperty("mblogid") String mblogId,
        @JsonProperty("created_at") String createdAt,
        String text,
        @JsonProperty("text_raw") String textRaw,
        String source,
        @JsonProperty("region_name") String regionName,
        @JsonProperty("isLongText") boolean isLongText,
        @JsonProperty("pic_num") int picNum,
        @JsonProperty("reposts_count") int repostsCount,
        @JsonProperty("comments_count") int commentsCount,
        @JsonProperty("attitudes_count") int attitudesCount,
        UserResponse user,
        @JsonProperty("pic_infos") Map<String, PicInfoResponse> picInfos,
        @JsonProperty("page_info") PageInfoResponse pageInfo,
        @JsonProperty("retweeted_status") MblogResponse retweetedStatus
) {

    public MblogResponse(Long id, String mblogId, String createdAt, String text, String source,
                         boolean isLongText, int picNum) {
        this(id, mblogId, createdAt, text, null, source, null, isLongText, picNum,
                0, 0, 0, null, null, null, null);
    }
}
