package xyz.fz.weibo.model.request;

import xyz.fz.weibo.client.WeiboConstants;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊发送图片：初始化文件请求参数（fileplatform/init.json）。
 * <p>
 * md5 为整个文件的 MD5，length 为文件字节数，name 为原始文件名，
 * type 为业务类型（图片固定 dm_attachment_pic），extprops 透传 recipientId 与 uploadType。
 */
public record GroupMediaUploadInitRequest(Long gid, long length, String name, String md5, String type) {

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
