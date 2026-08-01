package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupMediaUploadInitRequest;
import xyz.fz.weibo.model.response.GroupMediaUploadInitResponse;
import xyz.fz.weibo.model.response.GroupMediaUploadResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupMediaApiTest {

    @Mock
    private WeiboHttpClient client;

    private final ObjectMapper objectMapper = new ObjectMapper();

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

        GroupMediaUploadResponse response = api.upload(bytes, "test.png", "token-abc", 5046020575330655L);

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
}
