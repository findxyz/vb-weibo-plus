package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊消息请求参数。
 * <p>
 * max_mid 为分页游标，首次请求不传；t 为每次请求实时生成的毫秒时间戳。
 */
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
