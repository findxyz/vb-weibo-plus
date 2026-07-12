package xyz.fz.weibo.api;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;

import java.util.Map;

/**
 * 图床 / 视频直链下载接口。
 * <p>
 * 直链不带 Cookie，params 传空 Map，返回 byte[] 响应并透传响应头。
 */
@Component
public class DirectMediaApi {

    private final WeiboHttpClient client;

    public DirectMediaApi(WeiboHttpClient client) {
        this.client = client;
    }

    public ResponseEntity<byte[]> download(String url) {
        return client.getForBytes(url, Map.of(), WeiboConstants.HEADERS_DIRECT, false);
    }
}
