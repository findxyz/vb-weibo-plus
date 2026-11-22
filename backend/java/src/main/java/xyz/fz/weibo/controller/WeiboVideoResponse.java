package xyz.fz.weibo.controller;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import xyz.fz.weibo.client.exception.WeiboException;

final class WeiboVideoResponse {

    private WeiboVideoResponse() {}

    static Void write(ClientHttpResponse upstream, HttpServletResponse response)
            throws IOException {
        int status = upstream.getStatusCode().value();
        String range = upstream.getHeaders().getFirst(HttpHeaders.CONTENT_RANGE);
        if (status == 416 && range != null) {
            response.setStatus(status);
            response.setHeader(HttpHeaders.CONTENT_RANGE, range);
            response.setContentLength(0);
            return null;
        }
        MediaType type = upstream.getHeaders().getContentType();
        if ((status != 200 && (status != 206 || range == null))
                || type == null
                || !"video".equalsIgnoreCase(type.getType())
                || !"mp4".equalsIgnoreCase(type.getSubtype())) {
            throw new WeiboException("微博视频响应不正确。", -1);
        }
        response.setStatus(status);
        response.setContentType("video/mp4");
        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        if (range != null) {
            response.setHeader(HttpHeaders.CONTENT_RANGE, range);
        }
        long length = upstream.getHeaders().getContentLength();
        if (length >= 0) {
            response.setContentLengthLong(length);
        }
        upstream.getBody().transferTo(response.getOutputStream());
        return null;
    }
}
