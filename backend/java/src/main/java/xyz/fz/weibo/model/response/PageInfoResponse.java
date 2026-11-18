package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record PageInfoResponse(
        @JsonProperty("page_pic") String pagePic,
        @JsonProperty("page_url") String pageUrl,
        @JsonProperty("media_info") ApiMediaInfo mediaInfo
) {

    public record ApiMediaInfo(
            @JsonProperty("h5_url") String h5Url,
            @JsonProperty("stream_url") String streamUrl
    ) {
    }
}
