package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

public record GroupListRequest() {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("source", WeiboConstants.SOURCE);
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
