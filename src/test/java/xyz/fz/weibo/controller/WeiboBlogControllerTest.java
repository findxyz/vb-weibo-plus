package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.client.exception.WeiboUriTooLongException;
import xyz.fz.weibo.model.request.MyBlogRequest;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;
import xyz.fz.weibo.model.response.SearchProfileResponse;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 微博内容接口 Controller 层测试：验证正常返回与异常映射。
 */
@WebMvcTest(WeiboBlogController.class)
class WeiboBlogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private MyBlogApi myBlogApi;

    @MockBean
    private LongTextApi longTextApi;

    @MockBean
    private SearchProfileApi searchProfileApi;

    @Test
    void myblog_正常返回_200_且包含JSON字段() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenReturn(new MyBlogResponse(
                        new MyBlogResponse.MyBlogData(123L, List.of(), 0), 1));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(jsonPath("$.data.since_id").value(123));
    }

    @Test
    void myblog_Cookie失效时返回401() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenThrow(new WeiboCookieExpiredException("Cookie 失效"));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.msg").value("Cookie 失效"));
    }

    @Test
    void myblog_限流时返回429() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenThrow(new WeiboRateLimitException("限流重试耗尽"));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(429))
                .andExpect(jsonPath("$.msg").value("限流重试耗尽"));
    }

    @Test
    void myblog_URI过长时返回414() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenThrow(new WeiboUriTooLongException("URI 过长"));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isUriTooLong())
                .andExpect(jsonPath("$.code").value(414))
                .andExpect(jsonPath("$.msg").value("URI 过长"));
    }

    @Test
    void myblog_带errorCode的业务异常返回502() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenThrow(new WeiboException("业务错误", 10023));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502))
                .andExpect(jsonPath("$.msg").value("业务错误"));
    }

    @Test
    void myblog_无errorCode的异常返回500() throws Exception {
        when(myBlogApi.myBlog(any(MyBlogRequest.class)))
                .thenThrow(new WeiboException("内部错误"));

        mockMvc.perform(get("/weibo/blog/mymblog").param("uid", "1").param("page", "1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500))
                .andExpect(jsonPath("$.msg").value("内部错误"));
    }

    @Test
    void longtext_正常返回200() throws Exception {
        when(longTextApi.longText(any()))
                .thenReturn(new LongTextResponse(
                        new LongTextResponse.LongTextData(
                                "正文内容", "原文", false, null), 1));

        mockMvc.perform(get("/weibo/blog/longtext").param("id", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(jsonPath("$.data.longTextContent").value("正文内容"));
    }

    @Test
    void searchProfile_正常返回200() throws Exception {
        when(searchProfileApi.searchProfile(any()))
                .thenReturn(new SearchProfileResponse(
                        new SearchProfileResponse.SearchProfileData(
                                List.of(), 0, ""), 1));

        mockMvc.perform(get("/weibo/blog/searchProfile")
                        .param("uid", "1")
                        .param("page", "1")
                        .param("startTime", "1000")
                        .param("endTime", "2000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(content().contentTypeCompatibleWith("application/json"));
    }
}
