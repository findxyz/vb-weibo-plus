package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊媒体下载请求参数。
 * <p>
 * fid 为群聊消息文件标识，imageType 区分缩略图 / 原图等类型（可选），
 * Origin 与 Referer 由 GroupMediaApi 通过专用 header 传递。
 */
public record GroupMediaRequest(String fid, String imageType) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("fid", fid);
        params.put("source", WeiboConstants.SOURCE);
        if (imageType != null && !imageType.isBlank()) {
            params.put("imageType", imageType);
        }
        return params;
    }
}
