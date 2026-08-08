package xyz.fz.weibo.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.model.response.LoginResponse;
import xyz.fz.weibo.service.ChatService;

import java.util.Map;

/**
 * 微博登录接口。
 */
@RestController
@RequestMapping("/weibo/login")
public class WeiboLoginController {

    private final LoginApi loginApi;
    private final GroupListApi groupListApi;
    private final ChatService chatService;

    public WeiboLoginController(LoginApi loginApi, GroupListApi groupListApi, ChatService chatService) {
        this.loginApi = loginApi;
        this.groupListApi = groupListApi;
        this.chatService = chatService;
    }

    @PostMapping("/qr")
    public LoginResponse qr() {
        LoginResponse response = loginApi.qrLogin();
        // 登录成功后立即同步群列表，避免前端拿到空列表
        chatService.syncGroups();
        return response;
    }

    @GetMapping(value = "/qr/image", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qrImage() {
        byte[] image = loginApi.captureQrImage();
        if (image == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(image);
    }

    @GetMapping("/status")
    public Map<String, Boolean> status() {
        try {
            groupListApi.list();
            return Map.of("valid", true);
        } catch (Exception e) {
            return Map.of("valid", false);
        }
    }
}
