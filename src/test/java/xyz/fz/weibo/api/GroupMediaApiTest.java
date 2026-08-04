package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupMediaUploadInitRequest;
import xyz.fz.weibo.model.request.GroupVideoInitRequest;
import xyz.fz.weibo.model.response.GroupMediaUploadInitResponse;
import xyz.fz.weibo.model.response.GroupMediaUploadResponse;
import xyz.fz.weibo.model.response.GroupVideoUploadInitResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GroupMediaApiTest {

    @Mock
    private WeiboHttpClient client;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Test
    void sends_string_fid_with_only_endpoint_specific_query_and_headers() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        GroupMediaRequest request = new GroupMediaRequest("5302496155143676_file", "compress");
        ResponseEntity<byte[]> response = ResponseEntity.ok(new byte[]{1});
        when(client.getForBytes(
                "https://upload.api.weibo.com/2/mss/msget",
                request.toParams(), WeiboConstants.HEADERS_MSGET, true))
                .thenReturn(response);

        assertThat(api.download(request)).isSameAs(response);
        assertThat(request.toParams()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "fid", "5302496155143676_file",
                "source", WeiboConstants.SOURCE,
                "imageType", "compress"
        ));
        assertThat(WeiboConstants.HEADERS_MSGET)
                .containsEntry(HttpHeaders.ORIGIN, "https://web.im.weibo.com")
                .containsEntry(HttpHeaders.REFERER, "https://web.im.weibo.com/");
        verify(client).getForBytes(
                "https://upload.api.weibo.com/2/mss/msget",
                request.toParams(), WeiboConstants.HEADERS_MSGET, true);
    }

    @Test
    void omits_image_type_for_video_cover_requests() {
        assertThat(new GroupMediaRequest("123", null).toParams())
                .containsExactlyInAnyOrderEntriesOf(Map.of("fid", "123", "source", WeiboConstants.SOURCE));
    }

    @Test
    void initUpload_posts_form_urlencoded_to_fileplatform_init_with_send_headers() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        GroupMediaUploadInitRequest request = new GroupMediaUploadInitRequest(
                5046020575330655L, 630L, "test.png", "42509cffa005422b1ca82fb76ff6d4e7", "dm_attachment_pic");
        when(client.postForm(
                eq("https://api.weibo.com/webim/fileplatform/init.json"),
                eq(request.toParams()), eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok(
                        "{\"fileToken\":\"token-abc\",\"length\":1024,\"urlTag\":1}"));

        GroupMediaUploadInitResponse response = api.initUpload(request);

        assertThat(response.fileToken()).isEqualTo("token-abc");
        assertThat(response.length()).isEqualTo(1024);
        assertThat(response.urlTag()).isEqualTo(1);
        assertThat(request.toParams()).containsEntry("extprops",
                "{\"uploadType\":3,\"recipientId\":5046020575330655}");
        assertThat(request.toParams()).containsEntry("check", "42509cffa005422b1ca82fb76ff6d4e7");
        verify(client).postForm(
                eq("https://api.weibo.com/webim/fileplatform/init.json"),
                eq(request.toParams()), eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_posts_multipart_to_uploadx_with_query_params_and_file_part() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] bytes = new byte[]{1, 2, 3};
        when(client.postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071291448867}"));

        GroupMediaUploadResponse response = api.upload(bytes, "test.png", "token-abc", 5046020575330655L, 1024);

        assertThat(response.fid()).isEqualTo(5326071291448867L);
        org.mockito.ArgumentCaptor<Map<String, String>> queryCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        org.mockito.ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                org.mockito.ArgumentCaptor.forClass(MultiValueMap.class);
        verify(client).postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                queryCaptor.capture(), bodyCaptor.capture(),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
        assertThat(queryCaptor.getValue()).containsOnly(
                Map.entry("source", WeiboConstants.SOURCE),
                Map.entry("is_chunk", "1"),
                Map.entry("selectId", "5046020575330655"));
        assertThat(bodyCaptor.getValue().get("filetoken")).containsExactly("token-abc");
        assertThat(bodyCaptor.getValue().get("startloc")).containsExactly("0");
        assertThat(bodyCaptor.getValue().get("file")).hasSize(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_chunks_oversized_file_by_init_length_and_returns_last_chunk_fid() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        // 2.5 MB 图片，init.length=1024 KB -> 切成 3 片：1MB + 1MB + 499963B
        int chunkSizeKb = 1024;
        int chunkSize = chunkSizeKb * 1024;
        int total = 2 * chunkSize + 499_963;
        byte[] bytes = new byte[total];
        // 模拟真实分片响应序列：中间片 {"succ":true}，最后一片返回 fid
        when(client.postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071291448867}"));

        GroupMediaUploadResponse response = api.upload(bytes, "media.png", "token-abc", 5046020575330655L, chunkSizeKb);

        assertThat(response.fid()).isEqualTo(5326071291448867L);
        // 共调用 3 次 postMultipart，每次一片
        verify(client, times(3)).postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
        // 校验每片 startloc 与字节长度
        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                org.mockito.ArgumentCaptor.forClass(MultiValueMap.class);
        verify(client, times(3)).postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), bodyCaptor.capture(),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
        java.util.List<MultiValueMap<String, Object>> bodies = bodyCaptor.getAllValues();
        assertThat(bodies.get(0).get("startloc")).containsExactly("0");
        assertThat(bodies.get(1).get("startloc")).containsExactly(String.valueOf(chunkSize));
        assertThat(bodies.get(2).get("startloc")).containsExactly(String.valueOf(2 * chunkSize));
        assertThat(((org.springframework.core.io.ByteArrayResource) bodies.get(0).get("file").get(0)).contentLength()).isEqualTo(chunkSize);
        assertThat(((org.springframework.core.io.ByteArrayResource) bodies.get(1).get("file").get(0)).contentLength()).isEqualTo(chunkSize);
        assertThat(((org.springframework.core.io.ByteArrayResource) bodies.get(2).get("file").get(0)).contentLength()).isEqualTo(499_963);
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_throws_when_response_has_no_fid_rejecting_error_body_silently_parsed_to_zero() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] bytes = new byte[]{1, 2, 3};
        // 真实分片过大错误：HTTP 200，body 不含 fid（会被反序列化为 fid=0）
        when(client.postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok(
                        "{\"error\":\"file piece is larger than initialized pieceSplitLength\","
                        + "\"error_code\":20054,\"http_code\":500}"));

        assertThatThrownBy(() -> api.upload(bytes, "media.png", "token-abc", 5046020575330655L, 1024))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("图片上传失败");
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_cover_posts_multipart_to_uploadx_with_image_name_field() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] cover = new byte[]{9, 9};
        when(client.postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071353316787}"));

        GroupMediaUploadResponse response = api.uploadCover(cover, "cover.png", 5046020575330655L);

        assertThat(response.fid()).isEqualTo(5326071353316787L);
        org.mockito.ArgumentCaptor<Map<String, String>> queryCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        org.mockito.ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                org.mockito.ArgumentCaptor.forClass(MultiValueMap.class);
        verify(client).postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                queryCaptor.capture(), bodyCaptor.capture(),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
        assertThat(queryCaptor.getValue()).containsOnly(
                Map.entry("source", WeiboConstants.SOURCE),
                Map.entry("gid", "5046020575330655"));
        assertThat(bodyCaptor.getValue().get("imageName")).hasSize(1);
        assertThat(bodyCaptor.getValue().get("file")).isNull();
    }

    @Test
    void upload_cover_throws_when_response_has_no_fid() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] cover = new byte[]{9, 9};
        when(client.postMultipart(
                eq("https://api.weibo.com/webim/uploadx.json"),
                any(Map.class), any(MultiValueMap.class),
                eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"));

        assertThatThrownBy(() -> api.uploadCover(cover, "cover.png", 5046020575330655L))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("视频封面上传失败");
    }

    @Test
    void init_video_upload_posts_form_with_mediaprops_to_multimedia_init() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        GroupVideoInitRequest request = new GroupVideoInitRequest(
                5046020575330655L, 9355L, "test.mp4", "1b5f45f90889d408c7d29f33318ebfc9", 320, 180, 2);
        when(client.postForm(
                eq("https://api.weibo.com/webim/2/multimedia/init.json"),
                eq(request.toParams()), eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true)))
                .thenReturn(ResponseEntity.ok(
                        "{\"fileToken\":\"token-abc\",\"auth\":\"auth-xyz\",\"length\":4096,"
                                + "\"media_id\":\"media-1\",\"urlTag\":\"1\"}"));

        GroupVideoUploadInitResponse response = api.initVideoUpload(request);

        assertThat(response.fileToken()).isEqualTo("token-abc");
        assertThat(response.auth()).isEqualTo("auth-xyz");
        assertThat(response.length()).isEqualTo(4096);
        assertThat(response.mediaId()).isEqualTo("media-1");
        assertThat(request.toParams()).containsEntry("type", "dm_attachment_video");
        assertThat(request.toParams()).containsEntry("mediaprops",
                "{\"raw_md5\":\"1b5f45f90889d408c7d29f33318ebfc9\","
                        + "\"video_type\":\"dm_video\",\"screenshot\":0,"
                        + "\"width\":320,\"height\":180,\"duration\":2,"
                        + "\"dm_video_props\":{\"togid\":5046020575330655,\"touid\":0,\"gid\":0}}");
        verify(client).postForm(
                eq("https://api.weibo.com/webim/2/multimedia/init.json"),
                eq(request.toParams()), eq(WeiboConstants.HEADERS_WEBIM_SEND), eq(true));
    }

    @Test
    void upload_video_posts_octet_stream_with_x_up_auth_and_returns_fid() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] bytes = new byte[]{1, 2, 3};
        when(client.postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), eq(bytes), any(Map.class), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071357508212}"));

        GroupMediaUploadResponse response = api.uploadVideo(
                bytes, "test.mp4", "token-abc", "auth-xyz", 5046020575330655L, 4096,
                "1b5f45f90889d408c7d29f33318ebfc9");

        assertThat(response.fid()).isEqualTo(5326071357508212L);
        org.mockito.ArgumentCaptor<Map<String, String>> queryCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        org.mockito.ArgumentCaptor<Map<String, String>> headerCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(client).postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                queryCaptor.capture(), eq(bytes), headerCaptor.capture(), eq(true));
        assertThat(queryCaptor.getValue()).containsEntry("name", "test.mp4");
        assertThat(queryCaptor.getValue()).containsEntry("chunk", "0");
        assertThat(queryCaptor.getValue()).containsEntry("chunks", "1");
        assertThat(queryCaptor.getValue()).containsEntry("filetoken", "token-abc");
        assertThat(queryCaptor.getValue()).containsEntry("selectId", "5046020575330655");
        assertThat(queryCaptor.getValue()).containsEntry("check", "1b5f45f90889d408c7d29f33318ebfc9");
        assertThat(headerCaptor.getValue()).containsEntry("X-Up-Auth", "auth-xyz");
        assertThat(headerCaptor.getValue()).containsEntry(HttpHeaders.ORIGIN, "https://api.weibo.com");
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_video_degrades_to_single_upload_when_chunk_size_kb_is_zero() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] bytes = new byte[]{1, 2, 3, 4, 5};
        when(client.postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), any(byte[].class), any(Map.class), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071357508212}"));

        // chunkSizeKb <= 0 退化为单次上传（整文件一片）
        GroupMediaUploadResponse response = api.uploadVideo(
                bytes, "test.mp4", "token-abc", "auth-xyz", 5046020575330655L, 0,
                "1b5f45f90889d408c7d29f33318ebfc9");

        assertThat(response.fid()).isEqualTo(5326071357508212L);
        verify(client, times(1)).postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), any(byte[].class), any(Map.class), eq(true));
    }

    @Test
    @SuppressWarnings("unchecked")
    void upload_video_chunks_oversized_file_and_returns_last_chunk_fid() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        // 2.5 MB 视频，init.length=1024 KB -> 切成 3 片：1MB + 1MB + 499963B
        int chunkSizeKb = 1024;
        int chunkSize = chunkSizeKb * 1024;
        int total = 2 * chunkSize + 499_963;
        byte[] bytes = new byte[total];
        when(client.postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), any(byte[].class), any(Map.class), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"))
                .thenReturn(ResponseEntity.ok("{\"fid\":5326071357508212}"));

        GroupMediaUploadResponse response = api.uploadVideo(
                bytes, "media.mp4", "token-abc", "auth-xyz", 5046020575330655L, chunkSizeKb,
                "1b5f45f90889d408c7d29f33318ebfc9");

        assertThat(response.fid()).isEqualTo(5326071357508212L);
        verify(client, times(3)).postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), any(byte[].class), any(Map.class), eq(true));
        // 校验每片 query 的 chunk 序号与 startloc
        org.mockito.ArgumentCaptor<Map<String, String>> queryCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(client, times(3)).postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                queryCaptor.capture(), any(byte[].class), any(Map.class), eq(true));
        java.util.List<Map<String, String>> queries = queryCaptor.getAllValues();
        assertThat(queries.get(0).get("chunk")).isEqualTo("0");
        assertThat(queries.get(0).get("startloc")).isEqualTo("0");
        assertThat(queries.get(0).get("chunks")).isEqualTo("3");
        assertThat(queries.get(1).get("chunk")).isEqualTo("1");
        assertThat(queries.get(1).get("startloc")).isEqualTo(String.valueOf(chunkSize));
        assertThat(queries.get(2).get("chunk")).isEqualTo("2");
        assertThat(queries.get(2).get("startloc")).isEqualTo(String.valueOf(2 * chunkSize));
    }

    @Test
    void upload_video_throws_when_response_has_no_fid() {
        GroupMediaApi api = new GroupMediaApi(client, objectMapper);
        byte[] bytes = new byte[]{1, 2, 3};
        when(client.postOctetStream(
                eq("https://up.video.weibocdn.com/2/multimedia/upload.json"),
                any(Map.class), any(byte[].class), any(Map.class), eq(true)))
                .thenReturn(ResponseEntity.ok("{\"succ\":true}"));

        assertThatThrownBy(() -> api.uploadVideo(
                bytes, "test.mp4", "token-abc", "auth-xyz", 5046020575330655L, 4096,
                "1b5f45f90889d408c7d29f33318ebfc9"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("视频上传失败");
    }
}
