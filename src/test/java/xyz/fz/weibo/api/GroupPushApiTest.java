package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboHttpClient;

import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupPushApiTest {

    @Mock
    private WeiboCookieHolder cookieHolder;

    @Mock
    private WeiboHttpClient weiboHttpClient;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private WebSocket webSocket;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private GroupPushApi client;

    @BeforeEach
    void setUp() {
        client = new GroupPushApi(cookieHolder, weiboHttpClient, eventPublisher, objectMapper);
        when(webSocket.sendText(anyString(), eq(true)))
                .thenReturn(CompletableFuture.completedFuture(webSocket));
    }

    @AfterEach
    void tearDown() {
        client.close();
    }

    @Test
    void handshake_subscribes_to_account_channel() throws Exception {
        var listener = client.new PushListener(123, "credential");
        listener.onOpen(webSocket);
        listener.onText(webSocket,
                "[{\"channel\":\"/meta/handshake\",\"successful\":true,\"clientId\":\"abc\"}]", true);

        ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
        verify(webSocket, times(3)).sendText(sent.capture(), eq(true));
        JsonNode handshake = objectMapper.readTree(sent.getAllValues().get(0)).get(0);
        JsonNode subscribe = objectMapper.readTree(sent.getAllValues().get(1)).get(0);
        JsonNode connect = objectMapper.readTree(sent.getAllValues().get(2)).get(0);

        assertThat(handshake.path("channel").asText()).isEqualTo("/meta/handshake");
        assertThat(subscribe.path("subscription").asText()).isEqualTo("/im/123");
        assertThat(subscribe.path("clientId").asText()).isEqualTo("abc");
        assertThat(connect.path("channel").asText()).isEqualTo("/meta/connect");
    }

    @Test
    void business_message_publishes_raw_data() {
        var listener = client.new PushListener(123, "credential");
        listener.onOpen(webSocket);

        listener.onText(webSocket,
                "[{\"channel\":\"/im/123\",\"data\":{\"type\":\"presence\",\"info\":{\"id\":2}}}]", true);

        ArgumentCaptor<GroupPushEvent> event = ArgumentCaptor.forClass(GroupPushEvent.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue().data().path("type").asText()).isEqualTo("presence");
        assertThat(event.getValue().data().path("info").path("id").asLong()).isEqualTo(2);
    }

    @Test
    void subscription_does_not_publish_business_event() {
        var listener = client.new PushListener(123, "credential");
        listener.onOpen(webSocket);
        listener.onText(webSocket,
                "[{\"channel\":\"/meta/handshake\",\"successful\":true,\"clientId\":\"abc\"}]", true);
        listener.onText(webSocket,
                "[{\"channel\":\"/meta/subscribe\",\"successful\":true,\"subscription\":\"/im/123\"}]", true);

        verify(eventPublisher, times(0)).publishEvent(any());
    }
}
