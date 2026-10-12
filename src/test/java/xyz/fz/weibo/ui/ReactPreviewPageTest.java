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

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class ReactPreviewPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/post/bloggers", exchange -> {
            byte[] body = "[{\"uid\":1,\"screenName\":\"打包资源博主\"}]".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
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
    void classpath_preview_reads_bloggers_and_loads_both_entries_without_browser_errors() {
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
            page.navigate(baseUrl + "/preview/chat/index.html");
            assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("微博群聊预览")))
                    .isVisible();
            Assertions.assertThat(errors).isEmpty();
        }
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
