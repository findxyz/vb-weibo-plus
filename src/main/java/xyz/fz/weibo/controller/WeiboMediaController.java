package xyz.fz.weibo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.DirectMediaApi;

/**
 * 微博媒体下载接口：图床 / 视频直链。
 */
@RestController
@RequestMapping("/weibo/media")
public class WeiboMediaController {

    private final DirectMediaApi directMediaApi;

    public WeiboMediaController(DirectMediaApi directMediaApi) {
        this.directMediaApi = directMediaApi;
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> image(@RequestParam String url) {
        return directMediaApi.download(url);
    }

    @GetMapping("/video")
    public ResponseEntity<byte[]> video(@RequestParam String url) {
        return directMediaApi.download(url);
    }
}
