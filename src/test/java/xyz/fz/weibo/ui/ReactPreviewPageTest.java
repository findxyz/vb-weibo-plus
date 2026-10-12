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
            sendJson(exchange, "[{\"uid\":1,\"screenName\":\"打包资源博主\"}]");
        });
        server.createContext("/post/calendar", exchange -> sendJson(exchange, """
                {"months":[{"month":"2026-08","count":4,"days":[{"date":"2026-08-05","count":4}]}]}
                """));
        server.createContext("/post/list", exchange -> {
            listQuery.set(URLDecoder.decode(exchange.getRequestURI().getRawQuery(), StandardCharsets.UTF_8));
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

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        if (server != null) server.stop(0);
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
