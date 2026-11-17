package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

public record GroupVideoInitRequest(
        Long gid, long length, String name, String md5, int width, int height, int duration) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("extprops", "{\"uploadType\":3,\"recipientId\":" + gid + "}");
        params.put("length", String.valueOf(length));
        params.put("name", name);
        params.put("type", "dm_attachment_video");
        params.put("md5", md5);
        params.put("check", md5);
        params.put(
                "mediaprops",
                "{"
                        + "\"raw_md5\":\""
                        + md5
                        + "\","
                        + "\"video_type\":\"dm_video\","
                        + "\"screenshot\":0,"
                        + "\"width\":"
                        + width
                        + ","
                        + "\"height\":"
                        + height
                        + ","
                        + "\"duration\":"
                        + duration
                        + ","
                        + "\"dm_video_props\":{\"togid\":"
                        + gid
                        + ",\"touid\":0,\"gid\":0}"
                        + "}");
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
