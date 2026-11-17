package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record MyBlogResponse(MyBlogData data, int ok) {

    public record MyBlogData(
            @JsonProperty("since_id") String sinceId, List<MblogResponse> list, int total) {}
}
