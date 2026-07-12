package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 我的微博列表响应。
 */
public record MyBlogResponse(
        MyBlogData data,
        int ok
) {

    public record MyBlogData(
            @JsonProperty("since_id") Long sinceId,
            List<Mblog> list,
            int total
    ) {
    }
}
