package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊发送图片消息请求参数（send_message.json）。
 * <p>
 * id 为群 gid，fids 为 uploadx 响应的图片文件 id，annotations 透传 webchat 标识（clientid 先省略，
 * 见 ADR-0004），content 固定为「分享图片」，media_type 固定为 1。
 */
public record GroupSendImageRequest(Long id, long fids) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("annotations", "{\"webchat\":1}");
        params.put("content", "分享图片");
        params.put("fids", String.valueOf(fids));
        params.put("id", id == null ? null : id.toString());
        params.put("return_detail", "1");
        params.put("media_type", "1");
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
