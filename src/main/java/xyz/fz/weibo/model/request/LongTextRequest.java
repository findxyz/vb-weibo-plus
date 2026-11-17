package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

public record LongTextRequest(String id) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id);
        return params;
    }
}
