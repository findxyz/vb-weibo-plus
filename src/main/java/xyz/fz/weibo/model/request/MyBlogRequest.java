package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

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
