package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 长文请求参数。
 */
public record LongTextRequest(Long id) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id == null ? null : id.toString());
        return params;
    }
}
