package xyz.fz.weibo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.model.response.LoginResponse;

import java.util.Map;

/**
 * 微博登录接口。
 */
@RestController
@RequestMapping("/weibo/login")
public class WeiboLoginController {

    private final LoginApi loginApi;
    private final GroupListApi groupListApi;

    public WeiboLoginController(LoginApi loginApi, GroupListApi groupListApi) {
        this.loginApi = loginApi;
        this.groupListApi = groupListApi;
    }

    @PostMapping("/qr")
    public LoginResponse qr() {
        return loginApi.qrLogin();
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
