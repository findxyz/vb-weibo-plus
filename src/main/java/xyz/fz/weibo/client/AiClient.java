package xyz.fz.weibo.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import xyz.fz.weibo.client.exception.WeiboException;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * OpenAI 兼容格式的 AI 调用客户端。
 */
@Component
public class AiClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient streamHttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${weibo.ai.base-url:}")
    private String baseUrl;

    @Value("${weibo.ai.api-key:}")
    private String apiKey;

    @Value("${weibo.ai.model:deepseek-v4-flash}")
    private String model;

    @Value("${weibo.ai.system-prompt:请用中文回复分析结果。}")
    private String systemPrompt;

    @Value("${weibo.ai.timeout-seconds:120}")
    private int timeoutSeconds;

    public AiClient(@Qualifier("aiRestTemplate") RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * 调用大模型对话接口，返回生成的文本。
     *
     * @param userPrompt 用户提示词
     * @return AI 生成的文本
     */
    public String chat(String userPrompt) {
        assertConfigured();
        try {
            String requestBody = chatRequestBody(false, userPrompt);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (apiKey != null && !apiKey.isBlank()) {
                headers.setBearerAuth(apiKey);
            }

            ResponseEntity<String> responseEntity = restTemplate.exchange(
                    chatUrl(), HttpMethod.POST,
                    new HttpEntity<>(requestBody, headers), String.class);

            if (!responseEntity.getStatusCode().is2xxSuccessful()) {
                String body = responseEntity.getBody();
                throw new WeiboException("AI 返回错误状态码 " + responseEntity.getStatusCode() + "：" + (body != null ? body.substring(0, Math.min(body.length(), 500)) : "空"));
            }

            String response = responseEntity.getBody();
            if (response == null || response.isBlank()) {
                throw new WeiboException("AI 返回空响应");
            }
            String content = objectMapper.readTree(response)
                    .path("choices")
                    .path(0)
                    .path("message")
                    .path("content")
                    .asText();
            if (content == null || content.isBlank()) {
                throw new WeiboException("AI 返回内容为空：" + response.substring(0, Math.min(response.length(), 500)));
            }
            return content;
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException("调用 AI 失败：" + e.getMessage(), e);
        }
    }

    /**
     * 流式调用大模型对话接口，逐段回调增量文本，返回完整文本。
     *
     * @param userPrompt    用户提示词
     * @param deltaConsumer 增量文本回调，回调内抛异常会中断读取
     * @return AI 生成的完整文本
     */
    public String chatStream(String userPrompt, Consumer<String> deltaConsumer) {
        assertConfigured();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(chatUrl()))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .POST(HttpRequest.BodyPublishers.ofString(chatRequestBody(true, userPrompt)));
            if (apiKey != null && !apiKey.isBlank()) {
                builder.header("Authorization", "Bearer " + apiKey);
            }

            HttpResponse<InputStream> response = streamHttpClient.send(
                    builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    String text = new String(body.readAllBytes(), StandardCharsets.UTF_8);
                    throw new WeiboException("AI 返回错误状态码 " + response.statusCode()
                            + "：" + text.substring(0, Math.min(text.length(), 500)));
                }

                StringBuilder full = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(body, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (!line.startsWith("data:")) {
                            continue;
                        }
                        String payload = line.substring(5).trim();
                        if (payload.isEmpty()) {
                            continue;
                        }
                        if ("[DONE]".equals(payload)) {
                            break;
                        }
                        String delta = objectMapper.readTree(payload)
                                .path("choices")
                                .path(0)
                                .path("delta")
                                .path("content")
                                .asText("");
                        if (!delta.isEmpty()) {
                            full.append(delta);
                            deltaConsumer.accept(delta);
                        }
                    }
                }
                if (full.isEmpty()) {
                    throw new WeiboException("AI 返回内容为空");
                }
                return full.toString();
            }
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException("调用 AI 失败：" + e.getMessage(), e);
        }
    }

    private void assertConfigured() {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new WeiboException("AI 未配置，请在 application.yml 中设置 weibo.ai.base-url 和 weibo.ai.api-key");
        }
    }

    private String chatUrl() {
        return baseUrl.endsWith("/") ? baseUrl + "v1/chat/completions" : baseUrl + "/v1/chat/completions";
    }

    private String chatRequestBody(boolean stream, String userPrompt) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                ),
                "stream", stream
        ));
    }
}
