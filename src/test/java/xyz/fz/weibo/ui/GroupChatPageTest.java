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

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class GroupChatPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;

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
            if (query == null || !query.contains("gid=101")
                    || !query.contains("page=0") || !query.contains("size=50")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            sendJson(exchange, """
                    {
                      "group":{"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                        "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                      "items":[
                        {"mid":2,"gid":101,"msgType":321,"msgTypeName":"普通消息","mediaType":0,
                         "senderId":2,"senderName":"飞飞","senderAvatar":"","text":"较新消息",
                         "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                         "recallBy":"","createdAt":2000,"savedAt":2000,
                         "previewUrl":"","originalUrl":"","videoUrl":""},
                        {"mid":1,"gid":101,"msgType":321,"msgTypeName":"普通消息","mediaType":0,
                         "senderId":1,"senderName":"小凯","senderAvatar":"","text":"较早消息",
                         "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                         "recallBy":"","createdAt":1000,"savedAt":1000,
                         "previewUrl":"","originalUrl":"","videoUrl":""}
                      ],
                      "page":0,"size":50,"total":2
                    }
                    """);
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
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".group-row")).hasCount(2);
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        assertThat(page.locator("#send-button")).isDisabled();

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
}
