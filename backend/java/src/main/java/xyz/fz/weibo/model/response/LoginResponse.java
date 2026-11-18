package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record LoginResponse(
        String sub,
        String subp,
        @JsonProperty("SSOLoginState") String ssoLoginState,
        @JsonProperty("ALF") String alf
) {
}
