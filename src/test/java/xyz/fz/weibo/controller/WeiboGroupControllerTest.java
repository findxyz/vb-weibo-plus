package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.GroupMediaApi;
import xyz.fz.weibo.api.GroupMessagesApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 群聊接口 Controller 层测试：验证正常返回、字节流透传与异常映射。
 */
@WebMvcTest(WeiboGroupController.class)
class WeiboGroupControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private GroupListApi groupListApi;

    @MockitoBean
    private GroupMessagesApi groupMessagesApi;

    @MockitoBean
    private GroupMediaApi groupMediaApi;

    @Test
    void list_returns_200() throws Exception {
        when(groupListApi.list())
                .thenReturn(new GroupListResponse(0, List.of()));

        mockMvc.perform(get("/weibo/group/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalNumber").value(0))
                .andExpect(jsonPath("$.contacts").isArray());
    }

    @Test
    void list_returns_401_when_cookie_expired() throws Exception {
        when(groupListApi.list())
                .thenThrow(new WeiboCookieExpiredException("Cookie 失效"));

        mockMvc.perform(get("/weibo/group/list"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void messages_returns_200() throws Exception {
        when(groupMessagesApi.messages(any(GroupMessagesRequest.class)))
                .thenReturn(new GroupMessagesResponse(true, List.of(), 1700000000000L));

        mockMvc.perform(get("/weibo/group/messages").param("id", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value(true))
                .andExpect(jsonPath("$.ts").value(1700000000000L));
    }

    @Test
    void messages_returns_429_when_rate_limited() throws Exception {
        when(groupMessagesApi.messages(any(GroupMessagesRequest.class)))
                .thenThrow(new WeiboRateLimitException("限流"));

        mockMvc.perform(get("/weibo/group/messages").param("id", "1"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(429));
    }

    @Test
    void media_returns_bytes_with_headers() throws Exception {
        when(groupMediaApi.download(any()))
                .thenReturn(ResponseEntity.ok()
                        .header("Content-Type", "image/jpeg")
                        .header("Content-Disposition", "attachment; filename=\"a.jpg\"")
                        .body(new byte[]{1, 2, 3}));

        mockMvc.perform(get("/weibo/group/media").param("fid", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"a.jpg\""))
                .andExpect(content().bytes(new byte[]{1, 2, 3}));
    }

    @Test
    void media_returns_500_on_error() throws Exception {
        when(groupMediaApi.download(any()))
                .thenThrow(new WeiboException("下载失败"));

        mockMvc.perform(get("/weibo/group/media").param("fid", "1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500));
    }

    @Test
    void media_accepts_nonnumeric_string_fid() throws Exception {
        when(groupMediaApi.download(any()))
                .thenReturn(ResponseEntity.ok(new byte[]{1}));

        mockMvc.perform(get("/weibo/group/media")
                        .param("fid", "5302496155143676_file")
                        .param("imageType", "origin"))
                .andExpect(status().isOk());

        verify(groupMediaApi).download(
                new xyz.fz.weibo.model.request.GroupMediaRequest(
                        "5302496155143676_file", "origin"));
    }
}
