package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.AriaRole;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class GroupChatPageTest {
    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newFixedThreadPool(4, runnable -> {
            Thread thread = new Thread(runnable);
            thread.setDaemon(true);
            return thread;
        }));
        server.createContext("/chat/groups", exchange -> sendJson(exchange, """
                [{"gid":101,"name":"打包资源群","memberCount":10,"maxMember":50,"admins":[],"messageCount":2},
                 {"gid":202,"name":"第二资源群","memberCount":5,"maxMember":20,"admins":[],"messageCount":2}]
                """));
        server.createContext("/chat/messages/cursor", exchange -> {
            int gid = exchange.getRequestURI().getRawQuery().contains("gid=202") ? 202 : 101;
            sendJson(exchange, """
                    {"items":[{"mid":1,"gid":%d,"senderId":1,"senderName":"成员","text":"较早消息",
                    "msgType":1,"createdAt":1785889800000,"savedAt":1785889800000},
                    {"mid":2,"gid":%d,"senderId":2,"senderName":"成员","text":"打包后的消息",
                    "msgType":1,"createdAt":1785889860000,"savedAt":1785889860000}],"hasMore":false,"size":50}
                    """.formatted(gid, gid));
        });
        server.createContext("/chat/analyses", exchange -> {
            if (exchange.getRequestURI().getPath().equals("/chat/analyses/1")) {
                sendJson(exchange, """
                        {"id":1,"gid":101,"date":"2026-10-18","prompt":"打包分析",
                        "result":"## 打包分析\\n\\n- 要点","messageCount":2,"createdAt":"2026-10-18 10:00"}
                        """);
            } else {
                sendJson(exchange, """
                        {"items":[{"id":1,"date":"2026-10-18","promptPreview":"打包分析",
                        "messageCount":2,"createdAt":"2026-10-18 10:00"}],"page":1,"size":20,"total":1}
                        """);
            }
        });
        server.createContext("/weibo/login/status", exchange -> sendJson(exchange, "{\"valid\":true}"));
        server.createContext("/post/bloggers", exchange -> sendJson(exchange, "[]"));
        server.createContext("/", GroupChatPageTest::sendStaticResource);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
    }

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        if (server != null) server.stop(0);
    }

    @Test
    void formal_chat_loads_generated_modules_and_refreshes_without_page_errors() {
        try (Page page = browser.newPage()) {
            List<String> errors = new ArrayList<>();
            page.onPageError(errors::add);
            page.onResponse(response -> {
                if (response.url().contains("/assets/")) {
                    String mime = response.headers().getOrDefault("content-type", "");
                    if (response.status() != 200) errors.add(response.url());
                    if (response.url().endsWith(".js") && !mime.contains("javascript")) errors.add(mime);
                    if (response.url().endsWith(".css") && !mime.startsWith("text/css")) errors.add(mime);
                }
            });
            Assertions.assertThat(page.navigate(baseUrl + "/chat/index.html").status()).isEqualTo(200);
            assertThat(page.locator("h1")).hasText("微博群聊 - 打包资源群");
            assertThat(page.locator(".messages .message")).hasCount(2);
            assertThat(page.locator(".messages .message").first()).containsText("较早消息");
            assertThat(page.locator(".messages .message").last()).containsText("打包后的消息");
            assertThat(page.locator("script[type='module']")).hasAttribute("src", Pattern.compile("/assets/.*\\.js"));
            page.reload();
            assertThat(page.locator(".messages")).containsText("打包后的消息");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void formal_chat_preserves_the_saved_group_and_lands_at_the_bottom() {
        try (Page page = browser.newPage()) {
            page.navigate(baseUrl + "/chat/index.html");
            page.locator(".group-row").nth(1).click();
            assertThat(page.locator(".group-number")).hasText("群号：202");
            page.reload();
            assertThat(page.locator("h1")).hasText("微博群聊 - 第二资源群");
            assertThat(page.locator(".group-number")).hasText("群号：202");
            assertThat(page.locator(".messages .message")).hasCount(2);
            Assertions.assertThat(page.locator(".messages").evaluate(
                    "el => el.scrollTop + el.clientHeight >= el.scrollHeight - 2")).isEqualTo(true);
        }
    }

    @Test
    void both_formal_pages_round_trip_on_the_same_origin_with_the_keyboard() {
        try (Page page = browser.newPage()) {
            page.navigate(baseUrl + "/chat/index.html");
            page.getByRole(AriaRole.LINK, new Page.GetByRoleOptions().setName("切换到本地微博").setExact(true)).press("Enter");
            assertThat(page).hasURL(baseUrl + "/post/index.html");
            assertThat(page.locator("h1")).hasText("本地微博");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("切换到微博群聊").setExact(true)).press("Enter");
            assertThat(page).hasURL(baseUrl + "/chat/index.html");
            assertThat(page.locator(".messages")).containsText("打包后的消息");
        }
    }

    @Test
    void preview_and_legacy_runtime_resources_are_absent_from_the_classpath() {
        try (Page page = browser.newPage()) {
            for (String path : List.of("/preview/chat/index.html", "/preview/post/index.html", "/chat/chat.js",
                    "/chat/chat.css", "/chat/message-view.js", "/chat/weibo-emoji.js", "/chat/marked.min.js",
                    "/shared/date.js", "/shared/linkify.js", "/shared/storage-keys.js", "/shared/dompurify.min.js")) {
                Assertions.assertThat(page.request().get(baseUrl + path).status()).as(path).isEqualTo(404);
            }
        }
    }

    @Test
    void favicon_and_the_existing_dream_url_are_still_packaged() {
        try (Page page = browser.newPage()) {
            var icon = page.request().get(baseUrl + "/favicon.svg");
            Assertions.assertThat(icon.status()).isEqualTo(200);
            Assertions.assertThat(icon.headers().get("content-type")).contains("image/svg+xml");
            Assertions.assertThat(page.request().get(baseUrl + "/favicon.ico").status()).isEqualTo(200);
            var dream = page.request().get(baseUrl + "/chat/dream/1176117365.html");
            Assertions.assertThat(dream.status()).isEqualTo(200);
            Assertions.assertThat(dream.text()).contains("<canvas");
        }
    }

    @Test
    void saved_analysis_loads_its_lazy_markdown_modules_from_the_classpath() {
        try (Page page = browser.newPage()) {
            List<String> errors = new ArrayList<>();
            page.onPageError(errors::add);
            page.navigate(baseUrl + "/chat/index.html");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("🤖 群聊分析")).click();
            page.locator(".analysis-item").click();
            assertThat(page.locator(".analysis-detail-content h2")).hasText("打包分析");
            page.keyboard().press("Escape");
            assertThat(page.locator("dialog.analysis-dialog")).not().isVisible();
            Assertions.assertThat(errors).isEmpty();
        }
    }

    private static void sendJson(HttpExchange exchange, String json) throws IOException {
        sendBody(exchange, json.getBytes(StandardCharsets.UTF_8), "application/json; charset=UTF-8");
    }

    private static void sendStaticResource(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        try (InputStream input = GroupChatPageTest.class.getResourceAsStream("/static" + path)) {
            if (input == null) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            String mime = path.endsWith(".js") ? "text/javascript; charset=UTF-8"
                    : path.endsWith(".css") ? "text/css; charset=UTF-8"
                    : path.endsWith(".svg") ? "image/svg+xml"
                    : path.endsWith(".html") ? "text/html; charset=UTF-8" : "application/octet-stream";
            sendBody(exchange, input.readAllBytes(), mime);
        }
    }

    private static void sendBody(HttpExchange exchange, byte[] body, String mime) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", mime);
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
