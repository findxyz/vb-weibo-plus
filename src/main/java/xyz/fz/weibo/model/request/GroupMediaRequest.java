package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊媒体下载请求参数。
 * <p>
 * fid 为群聊消息文件标识，imageType 区分缩略图 / 原图等类型（可选），
 * Origin 在此处为 query 参数而非 header，由 WeiboHttpClient 跳过空值。
 */
public record GroupMediaRequest(Long fid, String imageType) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("fid", fid == null ? null : fid.toString());
        params.put("source", "209678993");
        params.put("imageType", imageType);
        params.put("Origin", "https://web.im.weibo.com");
        return params;
    }
}
