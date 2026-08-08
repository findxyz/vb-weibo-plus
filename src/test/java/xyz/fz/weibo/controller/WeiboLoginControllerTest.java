package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.LoginResponse;
import xyz.fz.weibo.service.ChatService;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WeiboLoginController.class)
class WeiboLoginControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private LoginApi loginApi;

    @MockitoBean
    private GroupListApi groupListApi;

    @MockitoBean
    private ChatService chatService;

    @Test
    void status_returns_true_when_group_list_succeeds() throws Exception {
        when(groupListApi.list()).thenReturn(new GroupListResponse(0, List.of()));

        mockMvc.perform(get("/weibo/login/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
    }

    @Test
    void status_returns_false_when_group_list_throws() throws Exception {
        when(groupListApi.list()).thenThrow(new RuntimeException("微博请求失败。"));

        mockMvc.perform(get("/weibo/login/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false));
    }

    @Test
    void qr_returns_login_response_from_login_api() throws Exception {
        when(loginApi.qrLogin()).thenReturn(new LoginResponse("sub-val", "subp-val", "sso-val", "alf-val"));

        mockMvc.perform(post("/weibo/login/qr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sub").value("sub-val"))
                .andExpect(jsonPath("$.subp").value("subp-val"))
                .andExpect(jsonPath("$.SSOLoginState").value("sso-val"))
                .andExpect(jsonPath("$.ALF").value("alf-val"));
    }

    @Test
    void qr_image_returns_png_when_capture_succeeds() throws Exception {
        byte[] png = new byte[]{1, 2, 3};
        when(loginApi.captureQrImage()).thenReturn(png);

        mockMvc.perform(get("/weibo/login/qr/image"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(content().bytes(png));
    }

    @Test
    void qr_image_returns_no_content_when_capture_returns_null() throws Exception {
        when(loginApi.captureQrImage()).thenReturn(null);

        mockMvc.perform(get("/weibo/login/qr/image"))
                .andExpect(status().isNoContent());
    }
}
