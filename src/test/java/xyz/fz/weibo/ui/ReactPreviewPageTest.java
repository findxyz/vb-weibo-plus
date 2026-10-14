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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class ReactPreviewPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;
    private static final AtomicReference<String> listQuery = new AtomicReference<>();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/post/bloggers", exchange -> {
            sendJson(exchange, "[{\"uid\":1,\"screenName\":\"打包资源博主\"},{\"uid\":2,\"screenName\":\"第二位博主\"}]");
        });
        server.createContext("/post/calendar", exchange -> {
            if ("uid=2".equals(exchange.getRequestURI().getRawQuery())) {
                sendJson(exchange, """
                        {"months":[{"month":"2026-07","count":1,"days":[{"date":"2026-07-10","count":1}]},
                        {"month":"2026-06","count":1,"days":[{"date":"2026-06-30","count":1}]}]}
                        """);
            } else {
                sendJson(exchange, """
                        {"months":[{"month":"2026-08","count":4,"days":[{"date":"2026-08-05","count":4}]}]}
                        """);
            }
        });
        server.createContext("/post/list", exchange -> {
            listQuery.set(URLDecoder.decode(exchange.getRequestURI().getRawQuery(), StandardCharsets.UTF_8));
            if (listQuery.get().contains("uids=2")) {
                String outerContent = listQuery.get().contains("start=2026-06-30") ? "" : "第二位博主的本地正文";
                sendJson(exchange, """
                        {"items":[{"mblogId":"fixture-2","createdAt":1783643400000,
                        "blogger":{"uid":2,"screenName":"第二位博主"},"content":"%s",
                        "retweeted":{"screenName":"原作者","content":"<b>打包转发原文</b><br>第二行 https://example.com/retweet. <script>window.retweetAttack=1</script><svg onload='window.retweetAttack=2'></svg>"}}],
                        "page":1,"size":9999,"total":1}
                        """.formatted(outerContent));
                return;
            }
            sendJson(exchange, """
                    {"items":[{"mblogId":"fixture-1","createdAt":1785889800000,
                    "blogger":{"uid":1,"screenName":"打包资源博主"},
                    "content":"<b>打包后的正文</b><br>第二行 https://example.com. <a href='/n/用户'>用户</a><script>window.attack=1</script><svg onload='window.attack=2'></svg>"}],
                    "page":1,"size":9999,"total":4}
                    """);
        });
        server.createContext("/preview/", ReactPreviewPageTest::sendStaticResource);
        server.createContext("/assets/", ReactPreviewPageTest::sendStaticResource);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
    }

    @Test
    void classpath_preview_switches_blogger_month_and_day_then_returns_to_all() {
        try (Page page = browser.newPage()) {
            List<String> errors = new ArrayList<>();
            page.onPageError(errors::add);
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator("article")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.getByLabel("当前范围")).hasText("第二位博主");
            assertThat(page.getByLabel("当前日期")).hasText("2026-07-10");
            assertThat(page.locator("article")).containsText("第二位博主的本地正文");
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-07-10 00:00:00&end=2026-07-10 23:59:59&uids=2");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06，1 条").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true)).click();
            assertThat(page.getByLabel("当前日期")).hasText("2026-06-30");
            assertThat(page.locator("article")).isVisible();
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-06-30 00:00:00&end=2026-06-30 23:59:59&uids=2");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("全部博主").setExact(true)).click();
            assertThat(page.getByLabel("当前日期")).hasText("2026-08-05");
            assertThat(page.locator("article")).containsText("打包后的正文");
            Assertions.assertThat(listQuery.get()).doesNotContain("uids=");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        if (server != null) server.stop(0);
    }

    @Test
    void classpath_preview_reads_retweet_text_safely_and_omits_pure_retweet_outer_body() {
        try (Page page = browser.newPage()) {
            List<String> errors = new ArrayList<>();
            page.onPageError(errors::add);
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator("article")).isVisible();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            assertThat(page.locator(".post-retweet-author")).hasText("@原作者");
            assertThat(page.locator(".post-retweet-content")).containsText("打包转发原文");
            assertThat(page.locator(".post-retweet-content")).hasCSS("font-size", "17px");
            assertThat(page.locator(".post-retweet-content script, .post-retweet-content svg, .post-retweet-content [onload]")).hasCount(0);
            assertThat(page.locator(".post-retweet-content a")).hasAttribute("href", "https://example.com/retweet");
            assertThat(page.locator(".post-retweet-content a")).hasCSS("text-decoration-line", "none");
            page.locator(".post-retweet-content a").hover();
            assertThat(page.locator(".post-retweet-content a")).hasCSS("text-decoration-line", "underline");
            assertThat(page.locator(".post-retweet-content a")).hasCSS("text-decoration-style", "solid");
            Assertions.assertThat(page.evaluate("window.retweetAttack")).isNull();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06，1 条").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true)).click();
            assertThat(page.getByLabel("当前日期")).hasText("2026-06-30");
            assertThat(page.locator(".post-retweet-content")).containsText("打包转发原文");
            assertThat(page.locator(".post-content")).hasCount(0);
            assertThat(page.locator(".post-header")).containsText("第二位博主");
            assertThat(page.locator("article")).hasCount(1);
            assertThat(page.getByLabel("博文总数")).hasText("共 1 条");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void classpath_preview_reads_default_day_safely_and_loads_both_entries_without_browser_errors() {
        List<String> errors = new ArrayList<>();
        try (Page page = browser.newPage()) {
            page.onResponse(response -> {
                if (response.url().contains("/assets/")) {
                    if (response.status() != 200) errors.add(response.url());
                    String mime = response.headerValue("content-type");
                    if (response.url().endsWith(".js") && !mime.startsWith("text/javascript")) errors.add(mime);
                    if (response.url().endsWith(".css") && !mime.startsWith("text/css")) errors.add(mime);
                }
            });
            page.onPageError(errors::add);
            page.onConsoleMessage(message -> {
                if (message.type().equals("error")) errors.add(message.text());
            });
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.getByRole(AriaRole.LIST, new Page.GetByRoleOptions().setName("博主")))
                    .containsText("打包资源博主");
            assertThat(page.locator("article")).containsText("打包后的正文");
            assertThat(page.getByLabel("当前范围")).hasText("全部博主");
            assertThat(page.getByLabel("当前日期")).hasText("2026-08-05");
            assertThat(page.getByLabel("博文总数")).hasText("共 4 条");
            assertThat(page.getByLabel("博文总数")).hasCSS("font-size", "12px");
            assertThat(page.getByLabel("博文总数")).hasCSS("font-variant-numeric", "tabular-nums");
            assertThat(page.getByRole(AriaRole.LINK, new Page.GetByRoleOptions().setName("正式 post 页面")))
                    .hasAttribute("href", "/post/index.html");
            assertThat(page.locator("article time")).hasText("2026-08-05 08:30");
            assertThat(page.locator(".post-content script, .post-content svg, .post-content [onload]")).hasCount(0);
            assertThat(page.locator(".post-content a").first()).hasAttribute("href", "https://example.com");
            assertThat(page.locator(".post-content a").last()).hasAttribute("href", "https://weibo.com/n/用户");
            Assertions.assertThat(page.evaluate("window.attack")).isNull();
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-08-05 00:00:00&end=2026-08-05 23:59:59");
            page.navigate(baseUrl + "/preview/chat/index.html");
            assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("微博群聊预览")))
                    .isVisible();
            Assertions.assertThat(errors).isEmpty();
        }
    }

    private static void sendJson(HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void sendStaticResource(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        try (InputStream input = ReactPreviewPageTest.class.getResourceAsStream("/static" + path)) {
            if (input == null) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            byte[] body = input.readAllBytes();
            String contentType = path.endsWith(".js") ? "text/javascript; charset=UTF-8"
                    : path.endsWith(".css") ? "text/css; charset=UTF-8"
                    : path.endsWith(".html") ? "text/html; charset=UTF-8"
                    : "application/octet-stream";
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        }
    }
}
