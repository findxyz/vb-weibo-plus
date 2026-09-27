package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboHttpClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

@Component
public class GroupPushApi {

    private static final Logger log = LoggerFactory.getLogger(GroupPushApi.class);
    private static final String PROFILE_URL = "https://api.weibo.com/webim/query_primary_info.json";
    private static final URI SOCKET_URL = URI.create("wss://web.im.weibo.com/im");
    private static final long STALE_AFTER_MS = 200_000;

    private final WeiboCookieHolder cookieHolder;
    private final WeiboHttpClient weiboHttpClient;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().sslContext(socketSslContext()).build();
    private final AtomicBoolean connecting = new AtomicBoolean();
    private final AtomicLong requestId = new AtomicLong();

    private volatile WebSocket socket;
    private volatile String socketCredential;
    private volatile String clientId;
    private volatile long lastFrameAt;

    public GroupPushApi(WeiboCookieHolder cookieHolder, WeiboHttpClient weiboHttpClient,
                           ApplicationEventPublisher eventPublisher, ObjectMapper objectMapper) {
        this.cookieHolder = cookieHolder;
        this.weiboHttpClient = weiboHttpClient;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
    }

    private static SSLContext socketSslContext() {
        try {
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[]{new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType) {
                }

                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType) {
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }}, null);
            return context;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("微博 WebSocket TLS 初始化失败", e);
        }
    }

    public void open() {
        String credential = cookieHolder.get();
        if (credential == null || credential.isBlank()) {
            closeCurrent();
            return;
        }
        if (socket != null && (!credential.equals(socketCredential)
                || System.currentTimeMillis() - lastFrameAt > STALE_AFTER_MS)) {
            closeCurrent();
        }
        if (socket != null || !connecting.compareAndSet(false, true)) {
            return;
        }
        try {
            JsonNode profile = objectMapper.readTree(weiboHttpClient.getForString(
                    PROFILE_URL,
                    Map.of("source", WeiboConstants.SOURCE, "t", Long.toString(System.currentTimeMillis())),
                    WeiboConstants.HEADERS_WEBIM, true).getBody());
            if (!profile.path("websocket_gray").asBoolean()) {
                connecting.set(false);
                return;
            }
            long uid = profile.path("profile").path("id").asLong();
            if (uid <= 0) {
                throw new IllegalStateException("微博账号 UID 缺失");
            }
            httpClient.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .header("Origin", "https://api.weibo.com")
                    .header("User-Agent", WeiboConstants.USER_AGENT)
                    .header("Cookie", credential)
                    .buildAsync(SOCKET_URL, new PushListener(uid, credential))
                    .whenComplete((ignored, error) -> {
                        connecting.set(false);
                        if (error != null) {
                            log.warn("微博 WebSocket 连接失败：{}", error.getMessage());
                        }
                    });
        } catch (Exception e) {
            connecting.set(false);
            log.warn("微博 WebSocket 初始化失败：{}", e.getMessage());
        }
    }

    private void closeCurrent() {
        WebSocket old = socket;
        socket = null;
        clientId = null;
        if (old != null) {
            old.sendClose(WebSocket.NORMAL_CLOSURE, "");
        }
    }

    private CompletionStage<WebSocket> send(WebSocket webSocket, Map<String, Object> frame) {
        try {
            return webSocket.sendText(objectMapper.writeValueAsString(List.of(frame)), true);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
    }

    private Map<String, Object> frame(String channel) {
        return new HashMap<>(Map.of("id", Long.toString(requestId.incrementAndGet()), "channel", channel));
    }

    private void sendConnect(WebSocket webSocket, boolean first) {
        Map<String, Object> connect = frame("/meta/connect");
        connect.put("clientId", clientId);
        connect.put("connectionType", "websocket");
        if (first) {
            connect.put("advice", Map.of("timeout", 0));
        }
        send(webSocket, connect);
    }

    public void closeConnection() {
        closeCurrent();
    }

    @PreDestroy
    public void close() {
        closeCurrent();
        httpClient.close();
    }

    class PushListener implements WebSocket.Listener {

        private final long uid;
        private final String credential;
        private final StringBuilder incoming = new StringBuilder();

        PushListener(long uid, String credential) {
            this.uid = uid;
            this.credential = credential;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            socket = webSocket;
            socketCredential = credential;
            lastFrameAt = System.currentTimeMillis();
            Map<String, Object> handshake = frame("/meta/handshake");
            handshake.put("version", "1.0");
            handshake.put("minimumVersion", "1.0");
            handshake.put("supportedConnectionTypes", List.of("websocket", "long-polling", "callback-polling"));
            handshake.put("advice", Map.of("timeout", 60_000, "interval", 0));
            send(webSocket, handshake);
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            incoming.append(data);
            if (last) {
                lastFrameAt = System.currentTimeMillis();
                try {
                    for (JsonNode message : objectMapper.readTree(incoming.toString())) {
                        handleMessage(webSocket, message);
                    }
                } catch (Exception e) {
                    log.warn("微博 WebSocket 消息解析失败：{}", e.getMessage());
                } finally {
                    incoming.setLength(0);
                }
            }
            webSocket.request(1);
            return null;
        }

        private void handleMessage(WebSocket webSocket, JsonNode message) {
            if (socket != webSocket) {
                return;
            }
            String channel = message.path("channel").asText();
            if ("/meta/handshake".equals(channel)) {
                if (!message.path("successful").asBoolean()) {
                    closeCurrent();
                    return;
                }
                clientId = message.path("clientId").asText();
                Map<String, Object> subscribe = frame("/meta/subscribe");
                subscribe.put("subscription", "/im/" + uid);
                subscribe.put("clientId", clientId);
                send(webSocket, subscribe).thenRun(() -> sendConnect(webSocket, true));
            } else if ("/meta/subscribe".equals(channel)) {
                if (message.path("successful").asBoolean()) {
                    log.info("微博 WebSocket 已订阅群消息推送");
                } else {
                    closeCurrent();
                }
            } else if ("/meta/connect".equals(channel)) {
                if (message.path("successful").asBoolean()) {
                    sendConnect(webSocket, false);
                } else {
                    closeCurrent();
                }
            } else if (channel.equals("/im/" + uid) && message.has("data")) {
                eventPublisher.publishEvent(new GroupPushEvent(message.get("data")));
            }
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (socket == webSocket) {
                socket = null;
            }
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (socket == webSocket) {
                socket = null;
            }
            log.warn("微博 WebSocket 连接中断：{}", error.getMessage());
        }
    }
}
