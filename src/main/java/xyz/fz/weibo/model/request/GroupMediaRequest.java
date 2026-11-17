package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;
import xyz.fz.weibo.client.WeiboConstants;

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
