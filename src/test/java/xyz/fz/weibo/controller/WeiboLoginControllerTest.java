package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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

    @MockitoBean
    private LoginApi loginApi;

    @MockitoBean
    private LoginRenewApi loginRenewApi;

    @Test
    void renew_returns_200_with_success() throws Exception {
        when(loginRenewApi.renew())
                .thenReturn(new LoginRenewResponse(true, "续期成功"));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("续期成功"));
    }

    @Test
    void renew_returns_500_on_exception() throws Exception {
        when(loginRenewApi.renew())
                .thenThrow(new WeiboException("续期失败"));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500))
                .andExpect(jsonPath("$.msg").value("续期失败"));
    }

    @Test
    void renew_returns_502_when_business_error() throws Exception {
        when(loginRenewApi.renew())
                .thenThrow(new WeiboException("续期第 1 步失败", 10023));

        mockMvc.perform(post("/weibo/login/renew"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }
}
