package xyz.fz.weibo.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;

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
