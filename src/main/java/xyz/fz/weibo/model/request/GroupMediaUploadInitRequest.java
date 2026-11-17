package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

public record GroupMediaUploadInitRequest(
        Long gid, long length, String name, String md5, String type) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("extprops", "{\"uploadType\":3,\"recipientId\":" + gid + "}");
        params.put("length", String.valueOf(length));
        params.put("name", name);
        params.put("type", type);
        params.put("md5", md5);
        params.put("check", md5);
        params.put("source", WeiboConstants.SOURCE);
        return params;
    }
}
