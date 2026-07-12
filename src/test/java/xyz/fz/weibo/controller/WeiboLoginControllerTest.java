package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.api.LoginRenewApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.response.LoginRenewResponse;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 登录接口 Controller 层测试：仅测 /renew（不测 Playwright 扫码 /qr）。
 */
@WebMvcTest(WeiboLoginController.class)
class WeiboLoginControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LoginApi loginApi;

    @MockBean
    private LoginRenewApi loginRenewApi;

    @Test
    void renew_正常返回_200_且包含续期成功标识() throws Exception {
        when(loginRenewApi.renew())
                .thenReturn(new LoginRenewResponse(true, "续期成功"));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("续期成功"));
    }

    @Test
    void renew_抛_WeiboException_时返回_500() throws Exception {
        when(loginRenewApi.renew())
                .thenThrow(new WeiboException("续期失败"));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500))
                .andExpect(jsonPath("$.msg").value("续期失败"));
    }

    @Test
    void renew_抛_带_errorCode_的异常时返回_502() throws Exception {
        when(loginRenewApi.renew())
                .thenThrow(new WeiboException("续期第 1 步失败", 10023));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }
}
