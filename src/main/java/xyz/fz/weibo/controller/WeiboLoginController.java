package xyz.fz.weibo.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.api.LoginRenewApi;
import xyz.fz.weibo.model.response.LoginRenewResponse;
import xyz.fz.weibo.model.response.LoginResponse;

/**
 * 微博登录接口。
 */
@RestController
@RequestMapping("/weibo/login")
public class WeiboLoginController {

    private final LoginApi loginApi;
    private final LoginRenewApi loginRenewApi;

    public WeiboLoginController(LoginApi loginApi, LoginRenewApi loginRenewApi) {
        this.loginApi = loginApi;
        this.loginRenewApi = loginRenewApi;
    }

    @PostMapping("/qr")
    public LoginResponse qr() {
        return loginApi.qrLogin();
    }

    @PostMapping("/renew")
    public LoginRenewResponse renew() {
        return loginRenewApi.renew();
    }
}
