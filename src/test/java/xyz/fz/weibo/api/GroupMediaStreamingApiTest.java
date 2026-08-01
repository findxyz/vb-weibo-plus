package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.config.NoOpResponseErrorHandler;
import xyz.fz.weibo.model.request.GroupMediaRequest;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GroupMediaStreamingApiTest {

    @TempDir
    private Path tempDir;

    @Test
    void stream_preserves_media_request_contract_and_forwards_range() throws Exception {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        WeiboCookieHolder credentialHolder = new WeiboCookieHolder();
        ReflectionTestUtils.setField(credentialHolder, "cookieFile", tempDir.resolve("credential.txt").toString());
        credentialHolder.set("SUB=current-credential");
        GroupMediaApi api = new GroupMediaApi(
                new WeiboHttpClient(restTemplate, credentialHolder, new ObjectMapper()),
                new ObjectMapper());
        HttpHeaders callerHeaders = new HttpHeaders();
        callerHeaders.set(HttpHeaders.RANGE, "bytes=0-2");

        server.expect(once(), requestTo(
                        "https://upload.api.weibo.com/2/mss/msget?fid=video-file&source=" + WeiboConstants.SOURCE))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(HttpHeaders.RANGE, "bytes=0-2"))
                .andExpect(header(HttpHeaders.ORIGIN, "https://web.im.weibo.com"))
                .andExpect(header(HttpHeaders.REFERER, "https://web.im.weibo.com/"))
                .andExpect(header(HttpHeaders.COOKIE, "SUB=current-credential"))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.APPLICATION_OCTET_STREAM));

        byte[] body = api.stream(
                new GroupMediaRequest("video-file", null), callerHeaders,
                response -> response.getBody().readAllBytes());

        assertThat(body).containsExactly(1, 2, 3);
        server.verify();
    }
}
