package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 我的微博列表请求参数。
 * <p>
 * feature=0 表示全部类型，since_id 为分页游标，首次请求不传。
 */
public record MyBlogRequest(Long uid, Integer page, String sinceId) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("uid", uid == null ? null : uid.toString());
        params.put("page", page == null ? null : page.toString());
        params.put("feature", "0");
        params.put("since_id", sinceId);
        return params;
    }
}
