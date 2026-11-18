package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

public record GroupMessagesRequest(Long id, Long maxMid) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id == null ? null : id.toString());
        params.put("count", "50");
        params.put("max_mid", maxMid == null ? null : maxMid.toString());
        params.put("convert_emoji", "1");
        params.put("query_sender", "1");
        params.put("source", WeiboConstants.SOURCE);
        params.put("t", String.valueOf(System.currentTimeMillis()));
        return params;
    }
}
