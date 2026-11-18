package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

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
