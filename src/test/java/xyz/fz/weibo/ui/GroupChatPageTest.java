package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class GroupChatPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;
    private static final AtomicInteger latestPageRequests = new AtomicInteger();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/groups", exchange -> sendJson(exchange, """
                [
                  {"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                   "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                  {"gid":202,"name":"LinkNow","avatar":"","memberCount":3,
                   "maxMember":200,"ownerId":2,"admins":[],"summary":"测试群","groupType":1}
                ]
                """));
        server.createContext("/chat/messages", exchange -> {
            String query = exchange.getRequestURI().getRawQuery();
            if (query == null || !query.contains("size=50")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            if (query.contains("gid=202")) {
                sendJson(exchange, messagesJson(0, 2,
                        mediaMessageJson(4, 1, "图片消息",
                                "/chat/media?gid=202&mid=4&variant=preview",
                                "/chat/media?gid=202&mid=4&variant=original", "") + ","
                                + mediaMessageJson(5, 13, "视频消息",
                                "/chat/media?gid=202&mid=5&variant=preview", "",
                                "/chat/media?gid=202&mid=5&variant=video")));
                return;
            }
            if (!query.contains("gid=101")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            if (query.contains("page=1")) {
                sendJson(exchange, messagesJson(1, 3, messageJson(0, "路路", "最早消息", 500)));
                return;
            }
            if (!query.contains("page=0")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            boolean refreshed = latestPageRequests.incrementAndGet() > 1;
            String newMessage = refreshed ? messageJson(3, "阿呆", "刷新后消息", 3000) + "," : "";
            sendJson(exchange, messagesJson(0, refreshed ? 4 : 3,
                    newMessage
                            + messageJson(2, "飞飞", "较新消息", 2000) + ","
                            + messageJson(1, "小凯", "较早消息", 1000)));
        });
        server.createContext("/chat/media", exchange -> {
            String query = exchange.getRequestURI().getRawQuery();
            if (query != null && query.contains("variant=video")) {
                byte[] body = new byte[0];
                exchange.getResponseHeaders().set("Content-Type", "video/mp4");
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
                return;
            }
            byte[] body = Base64.getDecoder().decode(
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
            exchange.getResponseHeaders().set("Content-Type", "image/png");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/chat/", GroupChatPageTest::sendStaticResource);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
    }

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) {
            browser.close();
        }
        if (playwright != null) {
            playwright.close();
        }
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void loads_real_groups_and_renders_latest_messages_in_chronological_order() {
        latestPageRequests.set(0);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".group-row")).hasCount(2);
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        assertThat(page.locator("#send-button")).isDisabled();

        page.close();
    }

    @Test
    void loads_earlier_messages_at_the_top_without_replacing_the_latest_page() {
        latestPageRequests.set(0);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#load-earlier")).isEnabled();
        page.locator("#load-earlier").click();

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"最早消息", "较早消息", "较新消息"});
        assertThat(page.locator("#load-earlier")).isDisabled();

        page.close();
    }

    @Test
    void refreshes_local_messages_on_focus_and_merges_them_by_mid() {
        latestPageRequests.set(0);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息", "刷新后消息"});
        assertThat(page.locator("[data-mid='1']")).hasCount(1);

        page.close();
    }

    @Test
    void previews_original_images_and_starts_video_after_clicking_its_cover() {
        latestPageRequests.set(0);
        Page page = browser.newPage();
        page.addInitScript("""
                window.__playCalls = 0;
                HTMLMediaElement.prototype.play = function () {
                  window.__playCalls += 1;
                  return Promise.resolve();
                };
                """);
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.locator("[data-mid='4'] .image-preview").click();
        assertThat(page.locator("#image-viewer")).isVisible();
        assertThat(page.locator("#image-viewer img"))
                .hasAttribute("src", "/chat/media?gid=202&mid=4&variant=original");
        page.locator("#close-image-viewer").click();

        page.locator("[data-mid='5'] .video-preview").click();
        assertThat(page.locator("[data-mid='5'] video"))
                .hasAttribute("src", "/chat/media?gid=202&mid=5&variant=video");
        org.assertj.core.api.Assertions
                .assertThat(((Number) page.evaluate("window.__playCalls")).intValue())
                .isEqualTo(1);

        page.close();
    }

    private static void sendStaticResource(HttpExchange exchange) throws IOException {
        String resourcePath = "/static" + exchange.getRequestURI().getPath();
        try (InputStream input = GroupChatPageTest.class.getResourceAsStream(resourcePath)) {
            if (input == null) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            byte[] body = input.readAllBytes();
            if (resourcePath.endsWith(".css")) {
                exchange.getResponseHeaders().set("Content-Type", "text/css; charset=UTF-8");
            } else if (resourcePath.endsWith(".js")) {
                exchange.getResponseHeaders().set("Content-Type", "text/javascript; charset=UTF-8");
            } else {
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
            }
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        }
    }

    private static void sendJson(HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static String messagesJson(int page, int total, String messages) {
        return """
                {
                  "group":{"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                    "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                  "items":[%s],"page":%d,"size":50,"total":%d
                }
                """.formatted(messages, page, total);
    }

    private static String messageJson(long mid, String sender, String text, long createdAt) {
        return """
                {"mid":%d,"gid":101,"msgType":321,"msgTypeName":"普通消息","mediaType":0,
                 "senderId":%d,"senderName":"%s","senderAvatar":"","text":"%s",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"","originalUrl":"","videoUrl":""}
                """.formatted(mid, mid, sender, text, createdAt, createdAt);
    }

    private static String mediaMessageJson(long mid, int mediaType, String text,
                                           String previewUrl, String originalUrl, String videoUrl) {
        return """
                {"mid":%d,"gid":202,"msgType":321,"msgTypeName":"普通消息","mediaType":%d,
                 "senderId":9,"senderName":"媒体用户","senderAvatar":"","text":"%s",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"%s","originalUrl":"%s","videoUrl":"%s"}
                """.formatted(mid, mediaType, text, mid * 1000, mid * 1000,
                previewUrl, originalUrl, videoUrl);
    }
}
