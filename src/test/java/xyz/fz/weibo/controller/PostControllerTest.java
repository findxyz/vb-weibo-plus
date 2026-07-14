package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.util.List;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PostController.class)
class PostControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PostService postService;

    @Test
    void incrementalBindsUidFromQueryAndReturnsPublicCountsOnly() throws Exception {
        when(postService.saveIncremental(1)).thenReturn(new SaveResult(3, 2, 1));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetchedCount").value(3))
                .andExpect(jsonPath("$.insertedCount").value(2))
                .andExpect(jsonPath("$.ignoredCount").value(1))
                .andExpect(jsonPath("$.latestPostId").doesNotExist());

        verify(postService).saveIncremental(1);
    }

    @Test
    void incrementalReturns401WhenCredentialIsInvalid() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboCookieExpiredException("Credential 失效"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void incrementalReturns429WhenUpstreamIsRateLimited() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboRateLimitException("上游限流"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(429));
    }

    @Test
    void incrementalReturns502WhenUpstreamBusinessResponseFails() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboException("上游业务失败", -1));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }

    @Test
    void incrementalReturns500ForInternalFailure() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboException("内部错误"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500));
    }

    @Test
    void bloggersReturnsOrderedLocalMetadataWithoutCursor() throws Exception {
        when(postService.queryBloggers()).thenReturn(List.of(
                new BloggerRecord(2, "第二位", "avatar", "/u/2", true),
                new BloggerRecord(1, "第一位", "", "/u/1", false)));

        mockMvc.perform(get("/post/bloggers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].uid").value(2))
                .andExpect(jsonPath("$[0].screenName").value("第二位"))
                .andExpect(jsonPath("$[0].verified").value(true))
                .andExpect(jsonPath("$[0].latestPostId").doesNotExist());
    }

    @Test
    void listBindsRepeatedUidsTimeBoundsAndPageDefaults() throws Exception {
        when(postService.queryPosts(List.of(1L, 2L),
                1783612800000L, 1783616523000L, 1, 100))
                .thenReturn(new PostQueryResult(List.of(), 1, 100, 0));

        mockMvc.perform(get("/post/list")
                        .param("uids", "1")
                        .param("uids", "2")
                        .param("start", "2026-07-10 00:00:00")
                        .param("end", "2026-07-10 01:02:03"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(100))
                .andExpect(jsonPath("$.total").value(0));

        verify(postService).queryPosts(List.of(1L, 2L),
                1783612800000L, 1783616523000L, 1, 100);
    }

    @Test
    void listWithoutUidsQueriesAllLocalBloggers() throws Exception {
        when(postService.queryPosts(null, null, null, 2, 10))
                .thenReturn(new PostQueryResult(List.of(), 2, 10, 0));

        mockMvc.perform(get("/post/list").param("page", "2").param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.size").value(10));

        verify(postService).queryPosts(null, null, null, 2, 10);
    }

    @Test
    void listRejectsCommaSeparatedUidsAndInvalidSize() throws Exception {
        mockMvc.perform(get("/post/list").param("uids", "1,2"))
                .andExpect(status().isBadRequest());
        verify(postService, never()).queryPosts(List.of(1L, 2L), null, null, 1, 100);

        when(postService.queryPosts(null, null, null, 1, 101))
                .thenThrow(new InvalidRequestException("size 必须介于 1 和 100 之间。"));
        mockMvc.perform(get("/post/list").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }
}
