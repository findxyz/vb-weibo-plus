package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊列表请求参数。
 * <p>
 * 所有参数固定，仅 t 为每次请求实时生成的毫秒时间戳。
 */
public record GroupListRequest() {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("source", "209678993");
        params.put("t", String.valueOf(System.currentTimeMillis()));
        params.put("count", "50");
        params.put("special_source", "3");
        params.put("add_virtual_user", "3,4");
        params.put("is_include_group", "0");
        params.put("need_back", "0,0");
        params.put("is_include_folder", "1");
        return params;
    }
}
