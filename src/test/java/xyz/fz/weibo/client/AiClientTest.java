package xyz.fz.weibo.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.config.NoOpResponseErrorHandler;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * AiClient 测试：用本地 HttpServer 起一个 OpenAI 兼容端点，校验 chat 与 chatStream 的请求构造、SSE 解析与异常映射。
 */
class AiClientTest {

    private HttpServer server;
    private AiClient aiClient;

    @BeforeEach
    void setUp() {
        aiClient = new AiClient(aiRestTemplate(), new ObjectMapper());
        ReflectionTestUtils.setField(aiClient, "baseUrl", "http://localhost:0/v1/");
        ReflectionTestUtils.setField(aiClient, "apiKey", "test-key");
        ReflectionTestUtils.setField(aiClient, "model", "test-model");
        ReflectionTestUtils.setField(aiClient, "systemPrompt", "请用中文回复分析结果。");
        ReflectionTestUtils.setField(aiClient, "timeoutSeconds", 5);
    }

    @AfterEach
    void tearDown() throws IOException {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void chat_throws_when_base_url_not_configured() {
        ReflectionTestUtils.setField(aiClient, "baseUrl", "");

        assertThatThrownBy(() -> aiClient.chat("分析一下"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 未配置");
    }

    @Test
    void chat_throws_on_non_2xx_status() throws Exception {
        startServer(exchange -> {
            byte[] body = "{\"error\":\"rate limited\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(429, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        assertThatThrownBy(() -> aiClient.chat("分析一下"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 返回错误状态码")
                .hasMessageContaining("rate limited");
    }

    @Test
    void chat_throws_on_empty_response_body() throws Exception {
        startServer(exchange -> {
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });

        assertThatThrownBy(() -> aiClient.chat("分析一下"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 返回空响应");
    }

    @Test
    void chat_throws_on_empty_content() throws Exception {
        startServer(exchange -> {
            byte[] body = "{\"choices\":[{\"message\":{\"content\":\"\"}}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        assertThatThrownBy(() -> aiClient.chat("分析一下"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 返回内容为空");
    }

    @Test
    void chat_returns_content_on_success() throws Exception {
        startServer(exchange -> {
            byte[] body = "{\"choices\":[{\"message\":{\"content\":\"这是分析结果\"}}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        String result = aiClient.chat("分析一下");

        assertThat(result).isEqualTo("这是分析结果");
    }

    @Test
    void chat_wraps_json_parse_failure() throws Exception {
        startServer(exchange -> {
            byte[] body = "not a json".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        assertThatThrownBy(() -> aiClient.chat("分析一下"))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("调用 AI 失败");
    }

    @Test
    void chatStream_throws_when_base_url_not_configured() {
        ReflectionTestUtils.setField(aiClient, "baseUrl", "");

        assertThatThrownBy(() -> aiClient.chatStream("分析一下", delta -> {
        }))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 未配置");
    }

    @Test
    void chatStream_throws_on_non_2xx_status() throws Exception {
        startServer(exchange -> {
            byte[] body = "{\"error\":\"rate limited\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(429, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        assertThatThrownBy(() -> aiClient.chatStream("分析一下", delta -> {
        }))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 返回错误状态码")
                .hasMessageContaining("rate limited");
    }

    @Test
    void chatStream_assembles_deltas_and_stops_at_done() throws Exception {
        String sse = String.join("\n",
                ": 流开始",
                "data: {\"choices\":[{\"delta\":{\"content\":\"第一\"}}]}",
                "",
                "data: {\"choices\":[{\"delta\":{\"content\":\"段\"}}]}",
                "event: ping",
                "data: [DONE]",
                "data: {\"choices\":[{\"delta\":{\"content\":\"不应出现\"}}]}"
        ) + "\n";
        startServer(exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            try (var out = exchange.getResponseBody()) {
                out.write(sse.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        });

        List<String> deltas = new ArrayList<>();
        String full = aiClient.chatStream("分析一下", deltas::add);

        assertThat(deltas).containsExactly("第一", "段");
        assertThat(full).isEqualTo("第一段");
    }

    @Test
    void chatStream_throws_when_content_empty() throws Exception {
        String sse = "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\ndata: [DONE]\n";
        startServer(exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            try (var out = exchange.getResponseBody()) {
                out.write(sse.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        });

        assertThatThrownBy(() -> aiClient.chatStream("分析一下", delta -> {
        }))
                .isInstanceOf(WeiboException.class)
                .hasMessageContaining("AI 返回内容为空");
    }

    private RestTemplate aiRestTemplate() {
        RestTemplate restTemplate = new RestTemplate(new HttpComponentsClientHttpRequestFactory(
                HttpClientBuilder.create().disableRedirectHandling().disableAutomaticRetries().build()));
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());
        return restTemplate;
    }

    private void startServer(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            handler.handle(exchange);
        });
        server.start();
        String baseUrl = "http://localhost:" + server.getAddress().getPort() + "/";
        ReflectionTestUtils.setField(aiClient, "baseUrl", baseUrl);
    }
}