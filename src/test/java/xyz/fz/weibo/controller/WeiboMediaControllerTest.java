package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.DirectMediaApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 媒体下载接口 Controller 层测试：验证字节流下载与响应头透传。
 */
@WebMvcTest(WeiboMediaController.class)
class WeiboMediaControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DirectMediaApi directMediaApi;

    @Test
    void image_正常返回字节流并透传响应头() throws Exception {
        when(directMediaApi.download(anyString()))
                .thenReturn(ResponseEntity.ok()
                        .header("Content-Type", "image/png")
                        .body(new byte[]{10, 20, 30}));

        mockMvc.perform(get("/weibo/media/image").param("url", "https://example.com/a.png"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(content().bytes(new byte[]{10, 20, 30}));
    }

    @Test
    void video_正常返回字节流并透传响应头() throws Exception {
        when(directMediaApi.download(anyString()))
                .thenReturn(ResponseEntity.ok()
                        .header("Content-Type", "video/mp4")
                        .body(new byte[]{4, 5, 6}));

        mockMvc.perform(get("/weibo/media/video").param("url", "https://example.com/a.mp4"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "video/mp4"))
                .andExpect(content().bytes(new byte[]{4, 5, 6}));
    }

    @Test
    void image_Cookie_失效时返回_401() throws Exception {
        when(directMediaApi.download(anyString()))
                .thenThrow(new WeiboCookieExpiredException("Cookie 失效"));

        mockMvc.perform(get("/weibo/media/image").param("url", "https://example.com/a.png"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void video_异常时返回_500() throws Exception {
        when(directMediaApi.download(anyString()))
                .thenThrow(new WeiboException("下载失败"));

        mockMvc.perform(get("/weibo/media/video").param("url", "https://example.com/a.mp4"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500));
    }
}
