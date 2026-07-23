package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.LoginApi;
import xyz.fz.weibo.model.response.GroupListResponse;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
}
