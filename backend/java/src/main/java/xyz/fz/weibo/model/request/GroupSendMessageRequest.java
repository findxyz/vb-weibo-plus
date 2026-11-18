package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

public record GroupSendMessageRequest(Long id, String content) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id == null ? null : id.toString());
        params.put("content", content);
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
