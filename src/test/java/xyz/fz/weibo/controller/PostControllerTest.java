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
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PostController.class)
class PostControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PostService postService;

    @Test
    void incremental_binds_uid_from_query_and_returns_public_counts_only() throws Exception {
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
    void range_binds_required_shanghai_time_bounds_and_returns_counts() throws Exception {
        when(postService.saveByRange(1, 1783652523000L, 1783656184000L))
                .thenReturn(new SaveResult(3, 2, 1));

        mockMvc.perform(post("/post/range")
                        .param("uid", "1")
                        .param("start", "2026-07-10 11:02:03")
                        .param("end", "2026-07-10 12:03:04"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetchedCount").value(3))
                .andExpect(jsonPath("$.insertedCount").value(2))
                .andExpect(jsonPath("$.ignoredCount").value(1));

        verify(postService).saveByRange(1, 1783652523000L, 1783656184000L);
    }

    @Test
    void range_requires_uid_and_both_time_bounds_in_the_expected_format() throws Exception {
        mockMvc.perform(post("/post/range")
                        .param("start", "2026-07-10 11:02:03")
                        .param("end", "2026-07-10 12:03:04"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/post/range")
                        .param("uid", "1")
                        .param("end", "2026-07-10 12:03:04"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/post/range")
                        .param("uid", "1")
                        .param("start", "2026/07/10 11:02:03")
                        .param("end", "2026-07-10 12:03:04"))
                .andExpect(status().isBadRequest());

        verify(postService, never()).saveByRange(
                anyLong(),
                anyLong(),
                anyLong());
    }

    @Test
    void image_returns_only_captured_media_bytes_and_content_type() throws Exception {
        when(postService.queryPostImage("saved-mblog", "p1", "thumbnail"))
                .thenReturn(new MediaBinary(new byte[]{10, 20, 30}, "image/png"));

        mockMvc.perform(get("/post/image")
                        .param("mblogId", "saved-mblog")
                        .param("pid", "p1")
                        .param("variant", "thumbnail")
                        .param("url", "https://evil.example/arbitrary.png"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().doesNotExist("Content-Disposition"))
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(content().bytes(new byte[]{10, 20, 30}));

        verify(postService).queryPostImage("saved-mblog", "p1", "thumbnail");
    }

    @Test
    void video_cover_defaults_to_current_and_supports_retweeted_selector() throws Exception {
        when(postService.queryPostVideoCover("saved-mblog", false))
                .thenReturn(new MediaBinary(new byte[]{1}, "image/jpeg"));
        when(postService.queryPostVideoCover("saved-mblog", true))
                .thenReturn(new MediaBinary(new byte[]{2}, "image/webp"));

        mockMvc.perform(get("/post/video-cover").param("mblogId", "saved-mblog"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(content().bytes(new byte[]{1}));
        mockMvc.perform(get("/post/video-cover")
                        .param("mblogId", "saved-mblog")
                        .param("retweeted", "true"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/webp"))
                .andExpect(content().bytes(new byte[]{2}));

        verify(postService).queryPostVideoCover("saved-mblog", false);
        verify(postService).queryPostVideoCover("saved-mblog", true);
    }

    @Test
    void media_maps_local_and_upstream_failures_to_public_statuses() throws Exception {
        when(postService.queryPostImage("saved-mblog", "p1", "large"))
                .thenThrow(new InvalidRequestException("不支持的 variant。"));
        when(postService.queryPostImage("missing", "p1", "thumbnail"))
                .thenThrow(new ResourceNotFoundException("本地微博不存在。"));
        when(postService.queryPostVideoCover("saved-mblog", false))
                .thenThrow(new WeiboCookieExpiredException("Credential 失效"));
        when(postService.queryPostVideoCover("saved-mblog", true))
                .thenThrow(new WeiboRateLimitException("上游限流"));
        when(postService.queryPostImage("saved-mblog", "p1", "original"))
                .thenThrow(new WeiboException("媒体下载失败。", -1));

        mockMvc.perform(get("/post/image")
                        .param("mblogId", "saved-mblog")
                        .param("pid", "p1")
                        .param("variant", "large"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
        mockMvc.perform(get("/post/image")
                        .param("mblogId", "missing")
                        .param("pid", "p1")
                        .param("variant", "thumbnail"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
        mockMvc.perform(get("/post/video-cover").param("mblogId", "saved-mblog"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
        mockMvc.perform(get("/post/video-cover")
                        .param("mblogId", "saved-mblog")
                        .param("retweeted", "true"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(429));
        mockMvc.perform(get("/post/image")
                        .param("mblogId", "saved-mblog")
                        .param("pid", "p1")
                        .param("variant", "original"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }

    @Test
    void incremental_returns_401_when_credential_is_invalid() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboCookieExpiredException("Credential 失效"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void incremental_returns_429_when_upstream_is_rate_limited() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboRateLimitException("上游限流"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(429));
    }

    @Test
    void incremental_returns_502_when_upstream_business_response_fails() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboException("上游业务失败", -1));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }

    @Test
    void incremental_returns_500_for_internal_failure() throws Exception {
        when(postService.saveIncremental(1))
                .thenThrow(new WeiboException("内部错误"));

        mockMvc.perform(post("/post/incremental").param("uid", "1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500));
    }

    @Test
    void bloggers_returns_ordered_local_metadata_without_cursor() throws Exception {
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
    void list_binds_repeated_uids_time_bounds_and_page_defaults() throws Exception {
        when(postService.queryPosts(List.of(1L, 2L),
                1783612800000L, 1783616523000L, "本地搜索", 1, 100))
                .thenReturn(new PostQueryResult(List.of(), 1, 100, 0));

        mockMvc.perform(get("/post/list")
                        .param("uids", "1")
                        .param("uids", "2")
                        .param("start", "2026-07-10 00:00:00")
                        .param("end", "2026-07-10 01:02:03")
                        .param("keyword", "本地搜索"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(100))
                .andExpect(jsonPath("$.total").value(0));

        verify(postService).queryPosts(List.of(1L, 2L),
                1783612800000L, 1783616523000L, "本地搜索", 1, 100);
    }

    @Test
    void list_without_uids_queries_all_local_bloggers() throws Exception {
        when(postService.queryPosts(null, null, null, null, 2, 10))
                .thenReturn(new PostQueryResult(List.of(), 2, 10, 0));

        mockMvc.perform(get("/post/list").param("page", "2").param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.size").value(10));

        verify(postService).queryPosts(null, null, null, null, 2, 10);
    }

    @Test
    void list_rejects_comma_separated_uids_and_invalid_size() throws Exception {
        mockMvc.perform(get("/post/list").param("uids", "1,2"))
                .andExpect(status().isBadRequest());
        verify(postService, never()).queryPosts(List.of(1L, 2L), null, null, null, 1, 100);

        when(postService.queryPosts(null, null, null, null, 1, 101))
                .thenThrow(new InvalidRequestException("size 必须介于 1 和 100 之间。"));
        mockMvc.perform(get("/post/list").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }
}
