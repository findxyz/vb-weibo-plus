package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊发送视频：初始化视频请求参数（webim/2/multimedia/init.json）。
 * <p>
 * md5 为整个视频的 MD5，length 为视频字节数，name 为原始文件名，
 * type 固定 dm_attachment_video，mediaprops 透传 width/height/duration/raw_md5/dm_video_props。
 */
public record GroupVideoInitRequest(Long gid, long length, String name, String md5,
                                    int width, int height, int duration) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("extprops", "{\"uploadType\":3,\"recipientId\":" + gid + "}");
        params.put("length", String.valueOf(length));
        params.put("name", name);
        params.put("type", "dm_attachment_video");
        params.put("md5", md5);
        params.put("check", md5);
        params.put("mediaprops", "{"
                + "\"raw_md5\":\"" + md5 + "\","
                + "\"video_type\":\"dm_video\","
                + "\"screenshot\":0,"
                + "\"width\":" + width + ","
                + "\"height\":" + height + ","
                + "\"duration\":" + duration + ","
                + "\"dm_video_props\":{\"togid\":" + gid + ",\"touid\":0,\"gid\":0}"
                + "}");
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
