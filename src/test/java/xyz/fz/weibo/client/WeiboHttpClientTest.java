package xyz.fz.weibo.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboUriTooLongException;
import xyz.fz.weibo.config.NoOpResponseErrorHandler;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WeiboHttpClientTest {

    @TempDir
    private Path tempDir;

    private HttpServer server;
    private CloseableHttpClient httpClient;

    @AfterEach
    void tearDown() throws IOException {
        if (server != null) {
            server.stop(0);
        }
        if (httpClient != null) {
            httpClient.close();
        }
    }

    @Test
    void streaming_response_can_be_consumed_before_upstream_completes() throws Exception {
        CountDownLatch firstChunkConsumed = new CountDownLatch(1);
        server = startServer(exchange -> {
            exchange.getResponseHeaders().set(HttpHeaders.CONTENT_RANGE, "bytes 0-5/12");
            exchange.sendResponseHeaders(206, 0);
            exchange.getResponseBody().write(new byte[]{1, 2, 3});
            exchange.getResponseBody().flush();
            try {
                assertThat(firstChunkConsumed.await(2, TimeUnit.SECONDS)).isTrue();
                exchange.getResponseBody().write(new byte[]{4, 5, 6});
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(e);
            } finally {
                exchange.close();
            }
        });

        byte[] body = createClient().getForStream(
                mediaUrl(), Map.of(), Map.of(), false,
                response -> {
                    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PARTIAL_CONTENT);
                    assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_RANGE))
                            .isEqualTo("bytes 0-5/12");
                    byte[] firstChunk = response.getBody().readNBytes(3);
                    firstChunkConsumed.countDown();
                    byte[] secondChunk = response.getBody().readAllBytes();
                    return new byte[]{
                            firstChunk[0], firstChunk[1], firstChunk[2],
                            secondChunk[0], secondChunk[1], secondChunk[2]
                    };
                });

        assertThat(body).containsExactly(1, 2, 3, 4, 5, 6);
    }

    @Test
    void streaming_response_rejects_unexpected_redirects() throws Exception {
        server = startServer(exchange -> {
            exchange.getResponseHeaders().set(HttpHeaders.LOCATION, "https://example.com/other");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        assertThatThrownBy(() -> createClient().getForStream(
                mediaUrl(), Map.of(), Map.of(), false,
                response -> response.getBody().readAllBytes()))
                .isInstanceOf(WeiboException.class)
                .hasMessage("非预期的 302 重定向：https://example.com/other");
    }

    @Test
    void streaming_response_maps_login_redirect_to_expired_credential() throws Exception {
        server = startServer(exchange -> {
            exchange.getResponseHeaders().set(HttpHeaders.LOCATION, "https://passport.weibo.com/login");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        assertThatThrownBy(() -> createClient().getForStream(
                mediaUrl(), Map.of(), Map.of(), true,
                response -> response.getBody().readAllBytes()))
                .isInstanceOf(WeiboCookieExpiredException.class);
    }

    @Test
    void streaming_response_preserves_uri_too_long_error() throws Exception {
        server = startServer(exchange -> {
            exchange.sendResponseHeaders(414, -1);
            exchange.close();
        });

        assertThatThrownBy(() -> createClient().getForStream(
                mediaUrl(), Map.of(), Map.of(), false,
                response -> response.getBody().readAllBytes()))
                .isInstanceOf(WeiboUriTooLongException.class);
    }

    @Test
    void streaming_response_retries_after_rate_limit() throws Exception {
        AtomicInteger requestCount = new AtomicInteger();
        server = startServer(exchange -> {
            if (requestCount.incrementAndGet() == 1) {
                exchange.sendResponseHeaders(429, -1);
            } else {
                exchange.sendResponseHeaders(200, 2);
                exchange.getResponseBody().write(new byte[]{7, 8});
            }
            exchange.close();
        });

        byte[] body = createClient().getForStream(
                mediaUrl(), Map.of(), Map.of(), false,
                response -> response.getBody().readAllBytes());

        assertThat(body).containsExactly(7, 8);
        assertThat(requestCount).hasValue(2);
    }

    @Test
    void post_form_encodes_params_and_returns_the_response_body() throws Exception {
        server = startServer(exchange -> {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                exchange.close();
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes());
            exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, "application/json");
            exchange.sendResponseHeaders(200, body.length());
            exchange.getResponseBody().write(body.getBytes());
            exchange.close();
        });

        ResponseEntity<String> resp = createClient().postForm(
                mediaUrl(), Map.of("content", "hello", "id", "123"), Map.of(), false);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).contains("content=hello").contains("id=123");
    }

    @Test
    void post_form_maps_login_redirect_to_expired_credential() throws Exception {
        server = startServer(exchange -> {
            exchange.getResponseHeaders().set(HttpHeaders.LOCATION, "https://passport.weibo.com/login");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        assertThatThrownBy(() -> createClient().postForm(
                mediaUrl(), Map.of("content", "hello"), Map.of(), true))
                .isInstanceOf(WeiboCookieExpiredException.class);
    }

    @Test
    void post_multipart_sends_query_params_in_url_and_multipart_body_with_file_part() throws Exception {
        server = startServer(exchange -> {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                exchange.close();
                return;
            }
            String contentType = exchange.getRequestHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
            String requestUri = exchange.getRequestURI().toString();
            byte[] body = exchange.getRequestBody().readAllBytes();
            String echoedBody = "contentType=" + contentType + "\nuri=" + requestUri + "\nbody=" + new String(body);
            exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, "text/plain");
            exchange.sendResponseHeaders(200, echoedBody.length());
            exchange.getResponseBody().write(echoedBody.getBytes());
            exchange.close();
        });

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResourceWithFilename(new byte[]{1, 2, 3}, "test.png"));
        body.add("filetoken", "token123");
        body.add("startloc", "0");

        ResponseEntity<String> resp = createClient().postMultipart(
                mediaUrl(), Map.of("source", WeiboConstants.SOURCE, "is_chunk", "1", "selectId", "5046020575330655"),
                body, Map.of(), false);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).contains("contentType=multipart/form-data;boundary=");
        assertThat(resp.getBody()).contains("source=" + WeiboConstants.SOURCE).contains("is_chunk=1").contains("selectId=5046020575330655");
        assertThat(resp.getBody()).contains("name=\"file\"").contains("filename=\"test.png\"");
        assertThat(resp.getBody()).contains("name=\"filetoken\"").contains("token123");
    }

    /** ByteArrayResource 子类，暴露 filename 让 RestTemplate 输出 Content-Disposition 的 filename。 */
    private static final class ByteArrayResourceWithFilename extends ByteArrayResource {
        private final String filename;

        ByteArrayResourceWithFilename(byte[] bytes, String filename) {
            super(bytes);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }

    private WeiboHttpClient createClient() {
        httpClient = HttpClientBuilder.create()
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .build();
        RestTemplate restTemplate = new RestTemplate(new HttpComponentsClientHttpRequestFactory(httpClient));
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());
        WeiboCookieHolder credentialHolder = new WeiboCookieHolder();
        ReflectionTestUtils.setField(credentialHolder, "cookieFile", tempDir.resolve("credential.txt").toString());
        credentialHolder.set("SUB=credential");
        return new WeiboHttpClient(restTemplate, credentialHolder, new ObjectMapper());
    }

    private HttpServer startServer(HttpHandler handler) throws IOException {
        HttpServer httpServer = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        httpServer.createContext("/media", handler);
        httpServer.start();
        return httpServer;
    }

    private String mediaUrl() {
        return "http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort() + "/media";
    }
}
