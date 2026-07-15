package xyz.fz.weibo.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.GroupMediaRequest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupMediaApiTest {

    @Mock
    private WeiboHttpClient client;

    @Test
    void sends_string_fid_with_only_endpoint_specific_query_and_headers() {
        GroupMediaApi api = new GroupMediaApi(client);
        GroupMediaRequest request = new GroupMediaRequest("5302496155143676_file", "compress");
        ResponseEntity<byte[]> response = ResponseEntity.ok(new byte[]{1});
        when(client.getForBytes(
                "https://upload.api.weibo.com/2/mss/msget",
                request.toParams(), WeiboConstants.HEADERS_MSGET, true))
                .thenReturn(response);

        assertThat(api.download(request)).isSameAs(response);
        assertThat(request.toParams()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "fid", "5302496155143676_file",
                "source", "209678993",
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
                .containsExactlyInAnyOrderEntriesOf(Map.of("fid", "123", "source", "209678993"));
    }
}
