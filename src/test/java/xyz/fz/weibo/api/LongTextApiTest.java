package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.response.LongTextResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LongTextApiTest {

    @Mock
    private WeiboHttpClient client;

    @Test
    void long_text_returns_deserialized_response_when_body_is_json() {
        LongTextApi api = new LongTextApi(client, new ObjectMapper());
        LongTextRequest request = new LongTextRequest("123");
        String body = """
                {"ok":1,"data":{"longTextContent":"完整正文","longTextContent_raw":"完整纯文本","isMarkdown":false}}
                """;
        when(client.getForString(
                "https://weibo.com/ajax/statuses/longtext",
                request.toParams(), WeiboConstants.HEADERS_AJAX, true))
                .thenReturn(ResponseEntity.ok(body));

        LongTextResponse response = api.longText(request);

        assertThat(response.ok()).isEqualTo(1);
        assertThat(response.data().longTextContent()).isEqualTo("完整正文");
        assertThat(response.data().longTextContentRaw()).isEqualTo("完整纯文本");
        verify(client).getForString(
                "https://weibo.com/ajax/statuses/longtext",
                request.toParams(), WeiboConstants.HEADERS_AJAX, true);
    }

    @Test
    void long_text_tolerates_non_json_body_by_returning_empty_response() {
        LongTextApi api = new LongTextApi(client, new ObjectMapper());
        LongTextRequest request = new LongTextRequest("123");
        // 微博偶发返回 HTML（如登录/风控页），以 '<' 开头，非 JSON。
        when(client.getForString(
                "https://weibo.com/ajax/statuses/longtext",
                request.toParams(), WeiboConstants.HEADERS_AJAX, true))
                .thenReturn(ResponseEntity.ok("<!doctype html><html>...</html>"));

        LongTextResponse response = api.longText(request);

        // 容错：不抛异常，按「无长文」处理，调用方据此回退到微博列表短文本。
        assertThat(response.ok()).isEqualTo(1);
        assertThat(response.data()).isNull();
    }
}
