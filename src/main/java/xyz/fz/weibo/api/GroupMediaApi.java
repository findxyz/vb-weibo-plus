package xyz.fz.weibo.api;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.GroupMediaRequest;

/**
 * 群聊媒体下载接口：msget。
 * <p>
 * 返回 byte[] 响应，透传 Content-Type / Content-Disposition 等响应头。
 */
@Component
public class GroupMediaApi {

    private static final String GROUP_MEDIA_URL = "https://upload.api.weibo.com/2/mss/msget";

    private final WeiboHttpClient client;

    public GroupMediaApi(WeiboHttpClient client) {
        this.client = client;
    }

    public ResponseEntity<byte[]> download(GroupMediaRequest request) {
        return client.getForBytes(GROUP_MEDIA_URL, request.toParams(), WeiboConstants.HEADERS_MSGET, true);
    }
}
