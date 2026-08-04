package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊发送视频消息请求参数（send_message.json）。
 * <p>
 * id 为群 gid，fids 为视频分片上传响应的文件 id，coverFid 为封面图 fid；
 * annotations 透传 video_pic_fid 与 webchat 标识（clientid 先省略，见 ADR-0004），
 * content 固定为「分享视频」，media_type 固定为 10。
 */
public record GroupSendVideoRequest(Long id, long fids, long coverFid) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("annotations", "{\"video_pic_fid\":" + coverFid + ",\"webchat\":1}");
        params.put("content", "分享视频");
        params.put("fids", String.valueOf(fids));
        params.put("id", id == null ? null : id.toString());
        params.put("return_detail", "1");
        params.put("media_type", "10");
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
