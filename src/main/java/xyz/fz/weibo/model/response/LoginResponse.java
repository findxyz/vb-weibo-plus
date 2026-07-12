package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 扫码登录响应，含四个 .weibo.com 域关键字段。
 */
public record LoginResponse(
        String sub,
        String subp,
        @JsonProperty("SSOLoginState") String ssoLoginState,
        @JsonProperty("ALF") String alf
) {
}
