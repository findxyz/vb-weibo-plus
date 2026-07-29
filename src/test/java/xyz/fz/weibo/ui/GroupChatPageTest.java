package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class GroupChatPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;
    private static final AtomicInteger latestPageRequests = new AtomicInteger();
    private static final AtomicBoolean failGroups = new AtomicBoolean();
    private static final AtomicBoolean failMessages = new AtomicBoolean();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/groups", exchange -> {
            if (failGroups.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            sendJson(exchange, """
                [
                  {"gid":101,"name":"周末活动讨论组","avatar":"https://example.test/group.png","memberCount":12,
                   "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1,
                   "latestSenderName":"小凯","latestMessage":"大家周末有空吗？"},
                  {"gid":202,"name":"LinkNow","avatar":"","memberCount":3,
                   "maxMember":200,"ownerId":2,"admins":[],"summary":"测试群","groupType":1,
                   "latestSenderName":"阿呆","latestMessage":"收到"}
                ]
                """);
        });
        server.createContext("/chat/messages", exchange -> {
            if (failMessages.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            String query = exchange.getRequestURI().getRawQuery();
            if (query == null || !query.contains("size=50")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            if (query.contains("gid=202")) {
                if (!query.contains("page=1")) {
                    exchange.sendResponseHeaders(400, -1);
                    exchange.close();
                    return;
                }
                sendJson(exchange, messagesJson(1, 4,
                        mediaMessageJson(4, 1, "分享图片",
                                "/chat/media?gid=202&mid=4&variant=preview",
                                "/chat/media?gid=202&mid=4&variant=original", "") + ","
                                + mediaMessageJson(5, 13, "分享视频",
                                "/chat/media?gid=202&mid=5&variant=preview", "",
                                "/chat/media?gid=202&mid=5&variant=video") + ","
                                + systemMessageJson(6, "涉及资金问题请务必提高警惕，谨防诈骗。查看案例") + ","
                                + mediaMessageJson(7, 1, "第二张图片",
                                "/chat/media?gid=202&mid=7&variant=preview",
                                "/chat/media?gid=202&mid=7&variant=original", "")));
                return;
            }
            if (!query.contains("gid=101")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            if (query.contains("page=2")) {
                sendJson(exchange, messagesJson(2, 3, messageJson(0, "路路", "最早消息", 500)));
                return;
            }
            if (!query.contains("page=1")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            boolean refreshed = latestPageRequests.incrementAndGet() > 1;
            String newMessage = refreshed ? messageJson(3, "阿呆", "刷新后消息", 3000) + "," : "";
            sendJson(exchange, messagesJson(1, refreshed ? 4 : 3,
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
            if (query != null && query.contains("mid=7") && query.contains("variant=original")) {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            byte[] body = """
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="300" viewBox="0 0 100 300">
                      <rect width="100" height="300" fill="#dcefff"/>
                    </svg>
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "image/svg+xml");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/chat/image", exchange -> {
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

    @BeforeEach
    void resetServerState() {
        latestPageRequests.set(0);
        failGroups.set(false);
        failMessages.set(false);
    }

    @Test
    void loads_real_groups_and_renders_latest_messages_in_chronological_order() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".group-row")).hasCount(2);
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        assertThat(page.locator("#send-button")).isDisabled();
        assertThat(page.locator("#composer")).isDisabled();
        assertThat(page.locator(".composer button:enabled")).hasCount(0);
        assertThat(page.locator(".message.mine")).hasCount(0);
        assertThat(page.locator(".read-only-badge")).hasCount(0);
        assertThat(page.locator("#refresh-state")).hasCount(0);
        assertThat(page.locator(".composer-tools > span")).hasCount(0);
        assertThat(page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("图片")).locator(".composer-tool-emoji"))
                .hasText("🖼️");
        Object avatarFitsContainer = page.locator(".group-avatar img").first().evaluate("""
                image => image.offsetWidth === image.parentElement.clientWidth
                  && image.offsetHeight === image.parentElement.clientHeight
                """);
        org.assertj.core.api.Assertions.assertThat(avatarFitsContainer).isEqualTo(true);

        page.close();
    }

    @Test
    void shows_group_capacity_in_the_conversation_header() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#current-size")).hasText("500 人群");

        page.close();
    }

    @Test
    void shows_the_latest_message_summary_truncated_to_ten_characters() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".group-preview"))
                .hasText(new String[]{"小凯：大家周末有空吗...", "阿呆：收到"});

        page.close();
    }

    @Test
    void loads_earlier_messages_at_the_top_without_replacing_the_latest_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = element.scrollHeight;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#load-earlier")).isHidden();

        page.locator("#messages").evaluate("""
                element => {
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator(".messages-shell > #load-earlier")).isVisible();
        assertThat(page.locator("#load-earlier")).isEnabled();

        page.locator("#messages").evaluate("""
                element => {
                  element.scrollTop = 10;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#load-earlier")).isHidden();
        page.locator("#messages").evaluate("""
                element => {
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        page.locator("#load-earlier").click();

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"最早消息", "较早消息", "较新消息"});
        assertThat(page.locator("#load-earlier")).isDisabled();
        assertThat(page.locator("#load-earlier")).isHidden();

        page.close();
    }

    @Test
    void refreshes_local_messages_on_focus_and_merges_them_by_mid() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                }
                """);
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息", "刷新后消息"});
        assertThat(page.locator("[data-mid='1']")).hasCount(1);
        assertThat(page.locator("#new-messages")).isVisible();
        page.locator("#new-messages").click();
        assertThat(page.locator("#new-messages")).isHidden();

        page.close();
    }

    @Test
    void hides_default_media_labels_but_keeps_real_captions() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='4'] .bubble")).hasCount(0);
        assertThat(page.locator("[data-mid='4'] .image-preview")).isVisible();
        assertThat(page.locator("[data-mid='5'] .bubble")).hasCount(0);
        assertThat(page.locator("[data-mid='5'] .video-preview")).isVisible();
        assertThat(page.locator("[data-mid='7'] .bubble")).hasText("第二张图片");

        page.close();
    }

    @Test
    void uses_a_full_screen_transparent_overlay_and_closes_outside_the_image() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        page.locator("[data-mid='4'] .image-preview").click();

        assertThat(page.locator("#image-viewer")).isVisible();
        assertThat(page.locator("#close-image-viewer")).hasCount(0);
        Object viewerIsAFullScreenOverlay = page.locator("#image-viewer").evaluate("""
                viewer => {
                  const box = viewer.getBoundingClientRect();
                  const style = getComputedStyle(viewer);
                  return box.left === 0
                    && box.top === 0
                    && box.width === innerWidth
                    && box.height === innerHeight
                    && style.borderTopWidth === "0px"
                    && style.backgroundColor === "rgba(0, 0, 0, 0.76)";
                }
                """);
        org.assertj.core.api.Assertions.assertThat(viewerIsAFullScreenOverlay).isEqualTo(true);

        page.locator("#image-viewer img").click();
        assertThat(page.locator("#image-viewer")).isVisible();
        page.mouse().click(4, 4);
        assertThat(page.locator("#image-viewer")).isHidden();

        page.close();
    }

    @Test
    void previews_original_images_and_starts_video_after_clicking_its_cover() {
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

        page.waitForFunction("""
                () => document.querySelector("[data-mid='4'] .image-preview img")?.naturalHeight > 0
                """);
        Object imageKeepsPortraitRatio = page.locator("[data-mid='4'] .image-preview").evaluate("""
                preview => {
                  const previewBox = preview.getBoundingClientRect();
                  const imageBox = preview.querySelector("img").getBoundingClientRect();
                  return previewBox.width < previewBox.height
                    && Math.abs(previewBox.height - imageBox.height - 2) < 1;
                }
                """);
        org.assertj.core.api.Assertions.assertThat(imageKeepsPortraitRatio).isEqualTo(true);
        assertThat(page.locator("[data-mid='6'].system-message .bubble"))
                .hasText("涉及资金问题请务必提高警惕，谨防诈骗。查看案例");
        assertThat(page.locator("[data-mid='6'] .message-avatar")).hasCount(0);

        page.locator("[data-mid='4'] .image-preview").click();
        assertThat(page.locator("#image-viewer")).isVisible();
        assertThat(page.locator("#image-viewer img"))
                .hasAttribute("src", "/chat/media?gid=202&mid=4&variant=original");
        assertThat(page.locator("#image-viewer img")).isVisible();
        page.mouse().click(4, 4);

        page.locator("[data-mid='7'] .image-preview").click();
        Object newImageIsHiddenWhileLoading = page.locator("#image-viewer img")
                .evaluate("image => image.hidden");
        org.assertj.core.api.Assertions.assertThat(newImageIsHiddenWhileLoading).isEqualTo(true);
        assertThat(page.locator("#image-viewer-state")).hasText("正在加载原图…");
        assertThat(page.locator("#image-viewer img")).isVisible();
        assertThat(page.locator("#image-viewer-state")).isEmpty();
        page.mouse().click(4, 4);

        page.locator("[data-mid='5'] .video-preview").click();
        assertThat(page.locator("[data-mid='5'] video"))
                .hasAttribute("src", "/chat/media?gid=202&mid=5&variant=video");
        org.assertj.core.api.Assertions
                .assertThat(((Number) page.evaluate("window.__playCalls")).intValue())
                .isEqualTo(1);

        page.close();
    }

    @Test
    void keeps_the_initial_group_error_visible_and_allows_retrying_it() {
        failGroups.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#groups-state")).containsText("群聊列表加载失败");
        assertThat(page.locator("#retry-groups")).isVisible();
        failGroups.set(false);
        page.locator("#retry-groups").click();
        assertThat(page.locator(".group-row")).hasCount(2);

        page.close();
    }

    @Test
    void keeps_the_group_visible_when_messages_fail_and_allows_retrying_them() {
        failMessages.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator("#messages-state")).containsText("消息加载失败");
        assertThat(page.locator("#retry-messages")).isVisible();
        failMessages.set(false);
        page.locator("#retry-messages").click();
        assertThat(page.locator(".message")).hasCount(2);

        page.close();
    }

    @Test
    void filters_groups_by_name_and_restores_the_last_selected_group_after_reload() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        page.locator("#group-search").fill("Link");
        assertThat(page.locator(".group-row:visible")).hasCount(1);
        page.locator("#group-search").fill("");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        assertThat(page.locator("#current-group")).hasText("LinkNow");

        page.reload();
        assertThat(page.locator("#current-group")).hasText("LinkNow");

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

    private static String systemMessageJson(long mid, String text) {
        return """
                {"mid":%d,"gid":202,"msgType":321,"msgTypeName":"普通消息","mediaType":0,
                 "senderId":0,"senderName":"粉丝群","senderAvatar":"","text":"%s",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"","originalUrl":"","videoUrl":""}
                """.formatted(mid, text, mid * 1000, mid * 1000);
    }
}
