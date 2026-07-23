package xyz.fz.weibo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.ResponseExtractor;
import org.springframework.web.server.ResponseStatusException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageQueryResult;
import xyz.fz.weibo.domain.MessageView;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.ChatService;
import xyz.fz.weibo.service.ImageProxyService;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ChatController.class)
class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ChatService chatService;

    @MockitoBean
    private ImageProxyService imageProxyService;

    @Test
    void sync_has_no_request_arguments_and_returns_the_full_local_group_list() throws Exception {
        when(chatService.syncGroups()).thenReturn(List.of(group(2), group(1)));

        assertThat(ChatController.class.getMethod("syncGroups").getParameterCount()).isZero();
        mockMvc.perform(post("/chat/groups/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gid").value(2))
                .andExpect(jsonPath("$[0].admins[0]").value(10))
                .andExpect(jsonPath("$[1].gid").value(1));

        verify(chatService).syncGroups();
    }

    @Test
    void lists_local_groups_including_gid_only_placeholders() throws Exception {
        when(chatService.queryGroups()).thenReturn(List.of(
                new GroupRecord(3, "", "", 0, 0, 0, List.of(), "", 0)
        ));

        mockMvc.perform(get("/chat/groups"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gid").value(3))
                .andExpect(jsonPath("$[0].name").value(""))
                .andExpect(jsonPath("$[0].admins").isEmpty());

        verify(chatService).queryGroups();
    }

    @Test
    void maps_missing_upstream_contacts_to_bad_gateway() throws Exception {
        when(chatService.syncGroups())
                .thenThrow(new WeiboException("群列表响应缺少 contacts。", -1));

        mockMvc.perform(post("/chat/groups/sync"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }

    @Test
    void incremental_binds_only_the_required_gid_query_parameter() throws Exception {
        when(chatService.saveIncremental(101)).thenReturn(new SaveResult(3, 2, 1));

        mockMvc.perform(post("/chat/incremental").param("gid", "101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetchedCount").value(3))
                .andExpect(jsonPath("$.insertedCount").value(2))
                .andExpect(jsonPath("$.ignoredCount").value(1));

        verify(chatService).saveIncremental(101);
    }

    @Test
    void messages_binds_inclusive_shanghai_times_and_pagination_defaults() throws Exception {
        MessageView view = new MessageView(100, 101, 321, "普通消息", 0, 9, "发送者", "", "消息",
                List.of(), List.of(), "", Map.of(), List.of(), "", 1_000, 2_000, "", "",
                "/chat/media?gid=101&mid=100&variant=video");
        when(chatService.queryMessages(
                101, 1_783_652_523_000L, 1_783_656_184_000L, 1, 100))
                .thenReturn(new MessageQueryResult(group(101), List.of(view), 1, 100, 1));

        mockMvc.perform(get("/chat/messages")
                        .param("gid", "101")
                        .param("start", "2026-07-10 11:02:03")
                        .param("end", "2026-07-10 12:03:04"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.group.gid").value(101))
                .andExpect(jsonPath("$.items[0].mid").value(100))
                .andExpect(jsonPath("$.items[0].videoUrl")
                        .value("/chat/media?gid=101&mid=100&variant=video"))
                .andExpect(jsonPath("$.items[0].group").doesNotExist())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(100))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void messages_returns_sender_avatar() throws Exception {
        MessageView view = objectMapper.readValue("""
                {"mid": 100, "gid": 101, "senderAvatar": "https://example.test/avatar.jpg"}
                """, MessageView.class);
        when(chatService.queryMessages(101, null, null, 1, 100))
                .thenReturn(new MessageQueryResult(group(101), List.of(view), 1, 100, 1));

        mockMvc.perform(get("/chat/messages").param("gid", "101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].senderAvatar")
                        .value("https://example.test/avatar.jpg"));
    }

    @Test
    void messages_requires_gid() throws Exception {
        mockMvc.perform(get("/chat/messages"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void since_binds_shanghai_time_and_optional_starting_mid_from_query_parameters() throws Exception {
        when(chatService.saveBySince(101, 1_783_652_523_000L, 50L))
                .thenReturn(new SaveResult(4, 3, 1));

        mockMvc.perform(post("/chat/since")
                        .param("gid", "101")
                        .param("sinceTime", "2026-07-10 11:02:03")
                        .param("beforeMid", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetchedCount").value(4))
                .andExpect(jsonPath("$.insertedCount").value(3))
                .andExpect(jsonPath("$.ignoredCount").value(1));

        verify(chatService).saveBySince(101, 1_783_652_523_000L, 50L);
    }

    @Test
    void since_requires_gid_and_time_but_allows_omitting_before_mid() throws Exception {
        when(chatService.saveBySince(101, 1_783_652_523_000L, null))
                .thenReturn(new SaveResult(0, 0, 0));

        mockMvc.perform(post("/chat/since")
                        .param("gid", "101")
                        .param("sinceTime", "2026-07-10 11:02:03"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/chat/since").param("gid", "101"))
                .andExpect(status().isBadRequest());

        verify(chatService).saveBySince(101, 1_783_652_523_000L, null);
    }

    @Test
    void media_returns_only_mapped_bytes_and_content_type() throws Exception {
        when(chatService.queryMessageMedia(101, 100, "preview"))
                .thenReturn(new MediaBinary(new byte[]{1, 2, 3}, "image/jpeg"));

        mockMvc.perform(get("/chat/media")
                        .param("gid", "101")
                        .param("mid", "100")
                        .param("variant", "preview"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().doesNotExist("Content-Disposition"))
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(content().bytes(new byte[]{1, 2, 3}));
    }

    @Test
    void video_streams_the_full_response_with_playback_headers() throws Exception {
        MockClientHttpResponse upstream = new MockClientHttpResponse(
                new byte[]{4, 5, 6}, HttpStatus.OK);
        upstream.getHeaders().setContentType(MediaType.valueOf("video/mp4"));
        upstream.getHeaders().setContentLength(3);
        doAnswer(invocation -> {
            ResponseExtractor<Void> extractor = invocation.getArgument(2);
            return extractor.extractData(upstream);
        }).when(chatService).streamMessageVideo(eq(101L), eq(100L), any());

        mockMvc.perform(get("/chat/media")
                        .param("gid", "101")
                        .param("mid", "100")
                        .param("variant", "video"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "video/mp4"))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 3))
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(content().bytes(new byte[]{4, 5, 6}));
    }

    @Test
    void video_rejects_an_upstream_response_without_content_length() throws Exception {
        MockClientHttpResponse upstream = new MockClientHttpResponse(
                new byte[]{4, 5, 6}, HttpStatus.OK);
        upstream.getHeaders().setContentType(MediaType.valueOf("video/mp4"));
        doAnswer(invocation -> {
            ResponseExtractor<Void> extractor = invocation.getArgument(2);
            return extractor.extractData(upstream);
        }).when(chatService).streamMessageVideo(eq(101L), eq(101L), any());

        mockMvc.perform(get("/chat/media")
                        .param("gid", "101")
                        .param("mid", "101")
                        .param("variant", "video"))
                .andExpect(status().isBadGateway());
    }

    @Test
    void image_proxies_bytes_and_content_type() throws Exception {
        when(imageProxyService.fetch("https://example.test/avatar.jpg"))
                .thenReturn(new MediaBinary(new byte[]{4, 5, 6}, "image/jpeg"));

        mockMvc.perform(get("/chat/image")
                        .param("url", "https://example.test/avatar.jpg"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(content().bytes(new byte[]{4, 5, 6}));

        verify(imageProxyService).fetch("https://example.test/avatar.jpg");
    }

    @Test
    void image_maps_upstream_failure_to_bad_gateway() throws Exception {
        when(imageProxyService.fetch("https://example.test/avatar.jpg"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY));

        mockMvc.perform(get("/chat/image")
                        .param("url", "https://example.test/avatar.jpg"))
                .andExpect(status().isBadGateway());
    }

    @Test
    void media_maps_local_and_upstream_errors() throws Exception {
        when(chatService.queryMessageMedia(101, 100, "bad"))
                .thenThrow(new InvalidRequestException("不支持。"));
        when(chatService.queryMessageMedia(101, 101, "preview"))
                .thenThrow(new ResourceNotFoundException("不存在。"));
        when(chatService.queryMessageMedia(101, 102, "preview"))
                .thenThrow(new WeiboCookieExpiredException("Credential 失效。"));
        when(chatService.queryMessageMedia(101, 103, "preview"))
                .thenThrow(new WeiboRateLimitException("限流。"));
        when(chatService.queryMessageMedia(101, 104, "preview"))
                .thenThrow(new WeiboException("下载失败。", -1));

        mockMvc.perform(get("/chat/media").param("gid", "101").param("mid", "100")
                        .param("variant", "bad"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/chat/media").param("gid", "101").param("mid", "101")
                        .param("variant", "preview"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/chat/media").param("gid", "101").param("mid", "102")
                        .param("variant", "preview"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/chat/media").param("gid", "101").param("mid", "103")
                        .param("variant", "preview"))
                .andExpect(status().isTooManyRequests());
        mockMvc.perform(get("/chat/media").param("gid", "101").param("mid", "104")
                        .param("variant", "preview"))
                .andExpect(status().isBadGateway());
    }

    private GroupRecord group(long gid) {
        return new GroupRecord(gid, "群", "", 1, 500, 10, List.of(10L), "简介", 1);
    }
}
