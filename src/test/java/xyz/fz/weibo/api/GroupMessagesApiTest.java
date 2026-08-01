package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.request.GroupSendMessageRequest;
import xyz.fz.weibo.model.request.GroupSendImageRequest;
import xyz.fz.weibo.model.response.GroupMessagesResponse;
import xyz.fz.weibo.model.response.GroupSendMessageResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupMessagesApiTest {

    @Mock
    private WeiboHttpClient client;

    @Test
    void send_message_posts_form_to_send_endpoint_and_returns_deserialized_result() {
        GroupMessagesApi api = new GroupMessagesApi(client, new ObjectMapper());
        GroupSendMessageRequest request = new GroupSendMessageRequest(5046020575330655L, "hello");
        String body = """
                {"result":true,"mid":5326071289614715,"gid":5046020575330655,"content":"hello","time":1785317812,"ts":1785317812}
                """;
        when(client.postForm(
                "https://api.weibo.com/webim/groupchat/send_message.json",
                request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true))
                .thenReturn(ResponseEntity.ok(body));

        GroupSendMessageResponse response = api.send(request);

        assertThat(response.result()).isTrue();
        assertThat(response.mid()).isEqualTo(5326071289614715L);
        assertThat(response.gid()).isEqualTo(5046020575330655L);
        assertThat(response.content()).isEqualTo("hello");
        assertThat(response.time()).isEqualTo(1785317812L);
        assertThat(request.toParams()).containsEntry("id", "5046020575330655")
                .containsEntry("content", "hello")
                .containsEntry("source", WeiboConstants.SOURCE);
        assertThat(WeiboConstants.HEADERS_WEBIM_SEND)
                .containsEntry("Referer", "https://api.weibo.com/chat");
        verify(client).postForm(
                "https://api.weibo.com/webim/groupchat/send_message.json",
                request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true);
    }

    @Test
    void send_message_wraps_deserialization_failure_as_weibo_exception() {
        GroupMessagesApi api = new GroupMessagesApi(client, new ObjectMapper());
        GroupSendMessageRequest request = new GroupSendMessageRequest(1L, "hello");
        when(client.postForm(
                "https://api.weibo.com/webim/groupchat/send_message.json",
                request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true))
                .thenReturn(ResponseEntity.ok("not json"));

        assertThatThrownBy(() -> api.send(request))
                .isInstanceOf(WeiboException.class);
    }

    @Test
    void send_image_posts_form_to_send_endpoint_with_fids_and_media_type_one() {
        GroupMessagesApi api = new GroupMessagesApi(client, new ObjectMapper());
        GroupSendImageRequest request = new GroupSendImageRequest(5046020575330655L, 5326071291448867L);
        String body = """
                {"result":true,"mid":5326071289614715,"gid":5046020575330655,"content":"分享图片","media_type":1,"time":1785317812,"ts":1785317812}
                """;
        when(client.postForm(
                "https://api.weibo.com/webim/groupchat/send_message.json",
                request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true))
                .thenReturn(ResponseEntity.ok(body));

        GroupSendMessageResponse response = api.sendImage(request);

        assertThat(response.result()).isTrue();
        assertThat(response.mid()).isEqualTo(5326071289614715L);
        assertThat(response.mediaType()).isEqualTo(1);
        assertThat(request.toParams())
                .containsEntry("id", "5046020575330655")
                .containsEntry("fids", "5326071291448867")
                .containsEntry("media_type", "1")
                .containsEntry("content", "分享图片")
                .containsEntry("return_detail", "1")
                .containsEntry("annotations", "{\"webchat\":1}")
                .containsEntry("source", WeiboConstants.SOURCE);
        verify(client).postForm(
                "https://api.weibo.com/webim/groupchat/send_message.json",
                request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true);
    }

    @Test
    void send_message_request_carries_null_id_like_the_read_request() {
        GroupSendMessageRequest request = new GroupSendMessageRequest(null, "hello");

        assertThat(request.toParams())
                .containsEntry("content", "hello")
                .containsEntry("source", WeiboConstants.SOURCE);
    }
}
