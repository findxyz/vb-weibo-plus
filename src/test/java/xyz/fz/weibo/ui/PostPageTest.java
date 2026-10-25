package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
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
import java.util.List;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class PostPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/post/bloggers", exchange -> {
            if (!exchange.getRequestURI().getPath().equals("/post/bloggers")) {
                sendStaticResource(exchange);
                return;
            }
            sendJson(exchange, "[{\"uid\":1,\"screenName\":\"打包资源博主\"}]");
        });
        server.createContext("/post/calendar", exchange -> sendJson(exchange, """
                {"months":[{"month":"2026-08","count":1,"days":[{"date":"2026-08-05","count":1}]}]}
                """));
        server.createContext("/post/list", exchange -> sendJson(exchange, """
                {"items":[{"mblogId":"fixture-1","createdAt":1785889800000,
                "blogger":{"uid":1,"screenName":"打包资源博主"},
                "content":"打包后的正文"}],"page":1,"size":9999,"total":1}
                """));
        server.createContext("/preview/", PostPageTest::sendStaticResource);
        server.createContext("/post/", PostPageTest::sendStaticResource);
        server.createContext("/chat/", PostPageTest::sendStaticResource);
        server.createContext("/shared/", PostPageTest::sendStaticResource);
        server.createContext("/weibo/login/status", exchange -> sendJson(exchange, "{\"valid\":true}"));
        server.createContext("/assets/", PostPageTest::sendStaticResource);
        server.createContext("/favicon.svg", PostPageTest::sendStaticResource);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
    }

    @Test
    void formal_post_refreshes_and_retired_preview_and_legacy_resources_return_404() {
        try (Page page = browser.newPage()) {
            Assertions.assertThat(page.navigate(baseUrl + "/post/index.html").status()).isEqualTo(200);
            assertThat(page).hasTitle("本地微博");
            assertThat(page.locator("head link[rel='icon']")).hasAttribute("type", "image/svg+xml");
            Assertions.assertThat(page.evaluate("""
                    async () => {
                      const image = new Image();
                      image.src = document.querySelector('head link[rel="icon"]').href;
                      await image.decode();
                      return image.naturalWidth;
                    }
                    """)).isEqualTo(256);
            assertThat(page.locator(".preview-note")).hasCount(0);
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.reload();
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            for (String path : List.of("/preview/post/index.html", "/post/post.js", "/post/post.css",
                    "/post/bloggers.js", "/post/dates.js", "/post/posts.js", "/post/search.js",
                    "/post/viewer.js", "/post/assets/weibo-logo.svg")) {
                Assertions.assertThat(page.request().get(baseUrl + path).status()).as(path).isEqualTo(404);
            }
        }
    }

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        if (server != null) server.stop(0);
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
        try (InputStream input = PostPageTest.class.getResourceAsStream("/static" + path)) {
            if (input == null) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            byte[] body = input.readAllBytes();
            String contentType = path.endsWith(".js") ? "text/javascript; charset=UTF-8"
                    : path.endsWith(".css") ? "text/css; charset=UTF-8"
                    : path.endsWith(".svg") ? "image/svg+xml"
                    : path.endsWith(".html") ? "text/html; charset=UTF-8"
                    : "application/octet-stream";
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        }
    }
}
