package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.AriaRole;
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class PostPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;
    private static final AtomicInteger bloggersRequests = new AtomicInteger();
    private static final AtomicInteger calendarRequests = new AtomicInteger();
    private static final AtomicInteger listRequests = new AtomicInteger();
    private static final AtomicReference<String> lastListQuery = new AtomicReference<>();
    private static final AtomicBoolean failBloggers = new AtomicBoolean();
    private static final AtomicBoolean failCalendar = new AtomicBoolean();
    private static final AtomicBoolean failList = new AtomicBoolean();
    private static final AtomicBoolean loginInvalid = new AtomicBoolean();
    private static final AtomicInteger loginStatusRequests = new AtomicInteger();
    private static final AtomicInteger qrLoginRequests = new AtomicInteger();
    private static final AtomicBoolean failQrLogin = new AtomicBoolean();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/post/bloggers", exchange -> {
            bloggersRequests.incrementAndGet();
            if (failBloggers.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            sendJson(exchange, """
                    [
                      {"uid":1,"screenName":"第一位","avatar":"","profileUrl":"/u/1","verified":false},
                      {"uid":2,"screenName":"第二位","avatar":"https://example.test/a.png","profileUrl":"/u/2","verified":true}
                    ]
                    """);
        });
        server.createContext("/post/calendar", exchange -> {
            calendarRequests.incrementAndGet();
            if (failCalendar.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            String query = exchange.getRequestURI().getRawQuery();
            if (query != null && query.contains("uid=2")) {
                sendJson(exchange, """
                        {"months":[
                          {"month":"2026-07","count":1,"days":[{"date":"2026-07-10","count":1}]}
                        ]}
                        """);
                return;
            }
            sendJson(exchange, """
                    {"months":[
                      {"month":"2026-08","count":2,"days":[
                        {"date":"2026-08-04","count":1},
                        {"date":"2026-08-03","count":1}
                      ]},
                      {"month":"2026-07","count":1,"days":[
                        {"date":"2026-07-10","count":1}
                      ]}
                    ]}
                    """);
        });
        server.createContext("/post/list", exchange -> {
            listRequests.incrementAndGet();
            lastListQuery.set(exchange.getRequestURI().getRawQuery());
            if (failList.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            String query = exchange.getRequestURI().getRawQuery();
            String items;
            int total;
            if (query != null && query.contains("start=2026-08-04")) {
                items = multiPicPostJson("post-aug-04", "第一位", "八月四日的内容", 1783612800000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-08-03")) {
                items = retweetPicPostJson("post-aug-03", "第二位", "八月三日的微博", 1783526400000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-07-10")) {
                items = multilinePostJson("post-jul-10", "第一位", 1783612800000L);
                total = 1;
            } else {
                items = postJson("post-default", "第一位", "默认内容", 1783612800000L);
                total = 1;
            }
            sendJson(exchange, """
                    {"items":[%s],"page":1,"size":9999,"total":%d}
                    """.formatted(items, total));
        });
        server.createContext("/weibo/login/status", exchange -> {
            loginStatusRequests.incrementAndGet();
            boolean valid = !loginInvalid.get();
            sendJson(exchange, "{\"valid\":" + valid + "}");
        });
        server.createContext("/weibo/login/qr", exchange -> {
            qrLoginRequests.incrementAndGet();
            if (failQrLogin.get()) {
                exchange.sendResponseHeaders(502, -1);
                exchange.close();
                return;
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            loginInvalid.set(false);
            sendJson(exchange, "{\"sub\":\"SUB\",\"subp\":\"SUBP\",\"ssoLoginState\":\"1\",\"alf\":\"1\"}");
        });
        server.createContext("/test-img", exchange -> {
            byte[] body = new byte[]{
                    (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                    0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
                    (byte) 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
                    0x54, 0x08, (byte) 0xD7, 0x63, (byte) 0xF8, (byte) 0xCF, (byte) 0xC0, 0x00,
                    0x00, 0x00, 0x03, 0x00, 0x01, (byte) 0x8D, (byte) 0xA2, 0x43,
                    0x0C, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
                    0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82
            };
            exchange.getResponseHeaders().set("Content-Type", "image/png");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/post/", PostPageTest::sendStaticResource);
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
        bloggersRequests.set(0);
        calendarRequests.set(0);
        listRequests.set(0);
        lastListQuery.set(null);
        failBloggers.set(false);
        failCalendar.set(false);
        failList.set(false);
        loginInvalid.set(false);
        loginStatusRequests.set(0);
        qrLoginRequests.set(0);
        failQrLogin.set(false);
    }

    @Test
    void defaults_to_all_bloggers_and_loads_the_latest_day() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        assertThat(page.locator(".blogger-row.all-bloggers")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator("#current-filter")).hasText("全部微博");
        assertThat(page.locator(".blogger-row")).hasCount(3);
        assertThat(page.locator(".month-group")).hasCount(2);
        assertThat(page.locator(".month-group.open")).hasCount(1);
        assertThat(page.locator(".date-item.active")).hasCount(1);
        assertThat(page.locator(".date-item.active")).hasAttribute("data-date", "2026-08-04");

        page.close();
    }

    @Test
    void loads_posts_for_the_selected_day_without_pagination() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> {});

        assertThat(page.locator(".post-card")).hasCount(1);
        assertThat(page.locator(".post-content")).containsText("八月四日的内容");
        assertThat(page.locator("#feed-count")).hasText("共 1 条");
        assertThat(page.locator("#pagination")).hasCount(0);
        assertThat(page.locator(".feed-filters")).hasCount(0);

        page.close();
    }

    @Test
    void switching_a_day_reloads_the_feed_with_the_new_date_range() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> {});

        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-03"),
                () -> page.locator(".date-item[data-date='2026-08-03']").click());

        assertThat(page.locator(".date-item[data-date='2026-08-03']")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".date-item[data-date='2026-08-04']")).not().hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".post-content")).containsText("八月三日的微博");

        page.close();
    }

    @Test
    void switching_a_blogger_refreshes_the_date_tree() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/calendar") && item.url().contains("uid=2"),
                () -> page.getByText("第二位", new Page.GetByTextOptions().setExact(true)).click());

        assertThat(page.locator("#current-filter")).hasText("第二位 的微博");
        assertThat(page.locator(".blogger-row[data-uid='2']")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".blogger-row.all-bloggers")).not().hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".month-group")).hasCount(1);

        page.close();
    }

    @Test
    void all_bloggers_row_is_always_visible_and_not_filtered_by_search() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        page.locator("#blogger-search").fill("不存在");
        assertThat(page.locator(".blogger-row.all-bloggers")).isVisible();
        assertThat(page.locator(".blogger-row:not(.all-bloggers):visible")).hasCount(0);

        page.locator("#blogger-search").fill("");
        assertThat(page.locator(".blogger-row:not(.all-bloggers):visible")).hasCount(2);

        page.close();
    }

    @Test
    void clicking_all_bloggers_returns_to_aggregated_view() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.getByText("第二位", new Page.GetByTextOptions().setExact(true)).click();
        page.waitForResponse(
                item -> item.url().contains("/post/calendar") && !item.url().contains("uid=2"),
                () -> page.locator(".blogger-row.all-bloggers").click());

        assertThat(page.locator("#current-filter")).hasText("全部微博");
        assertThat(page.locator(".blogger-row.all-bloggers")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".month-group")).hasCount(2);

        page.close();
    }

    @Test
    void month_toggle_expands_and_collapses_the_day_list() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        assertThat(page.locator(".month-group[data-month='2026-07']")).not().hasClass(java.util.regex.Pattern.compile("open"));
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        assertThat(page.locator(".month-group[data-month='2026-07']")).hasClass(java.util.regex.Pattern.compile("open"));

        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        assertThat(page.locator(".month-group[data-month='2026-07']")).not().hasClass(java.util.regex.Pattern.compile("open"));

        page.close();
    }

    @Test
    void keeps_the_bloggers_visible_and_allows_retrying_when_posts_fail() {
        failList.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list"),
                () -> {});

        assertThat(page.locator("#posts-state")).containsText("加载失败");
        assertThat(page.locator("#retry-posts")).isVisible();
        assertThat(page.locator(".blogger-row")).hasCount(3);

        failList.set(false);
        page.waitForResponse(
                item -> item.url().contains("/post/list"),
                () -> page.locator("#retry-posts").click());
        assertThat(page.locator(".post-card")).hasCount(1);

        page.close();
    }

    @Test
    void shows_login_expired_prompt_and_starts_qr_login_on_click() {
        loginInvalid.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        assertThat(page.locator("#login-expired")).isVisible();
        assertThat(page.locator("#login-qr")).isEnabled();

        page.locator("#login-qr").click();
        assertThat(page.locator("#login-qr")).isDisabled();
        assertThat(page.locator("#login-expired")).isHidden();
        org.assertj.core.api.Assertions.assertThat(qrLoginRequests.get()).isGreaterThanOrEqualTo(1);

        page.close();
    }

    @Test
    void restores_qr_login_button_after_qr_login_failure() {
        loginInvalid.set(true);
        failQrLogin.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        assertThat(page.locator("#login-expired")).isVisible();
        page.locator("#login-qr").click();
        assertThat(page.locator("#login-qr")).isEnabled();
        assertThat(page.locator("#bloggers-state")).containsText("登录请求失败");

        page.close();
    }

    @Test
    void emoji_avatar_is_not_oversized() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        Object fontSize = page.locator(".blogger-avatar").first().evaluate(
                "el => getComputedStyle(el).fontSize");
        org.assertj.core.api.Assertions.assertThat(fontSize).isEqualTo("16px");

        Object lineHeight = page.locator(".blogger-avatar").first().evaluate(
                "el => getComputedStyle(el).lineHeight");
        org.assertj.core.api.Assertions.assertThat(lineHeight).isEqualTo("16px");

        page.close();
    }

    @Test
    void multi_image_post_opens_viewer_with_prev_next_navigation() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> {});

        page.locator(".post-pic").first().click();
        assertThat(page.locator("#image-viewer")).isVisible();
        assertThat(page.locator(".viewer-prev")).isVisible();
        assertThat(page.locator(".viewer-next")).isVisible();
        assertThat(page.locator("#viewer-counter")).hasText("1 / 3");

        page.locator(".viewer-next").click();
        assertThat(page.locator("#viewer-counter")).hasText("2 / 3");

        page.locator(".viewer-next").click();
        assertThat(page.locator("#viewer-counter")).hasText("3 / 3");

        page.locator(".viewer-prev").click();
        assertThat(page.locator("#viewer-counter")).hasText("2 / 3");

        page.close();
    }

    @Test
    void retweet_image_click_opens_viewer_without_navigating_away() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-03"),
                () -> page.locator(".date-item[data-date='2026-08-03']").click());

        String urlBefore = page.url();
        page.locator(".post-retweet-pic").first().click();
        assertThat(page.locator("#image-viewer")).isVisible();
        org.assertj.core.api.Assertions.assertThat(page.url()).isEqualTo(urlBefore);

        page.close();
    }

    @Test
    void pic_grid_has_no_gray_background_fill() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> {});

        Object bg = page.locator(".post-pic").first().evaluate(
                "el => getComputedStyle(el).backgroundColor");
        org.assertj.core.api.Assertions.assertThat(bg).isEqualTo("rgba(0, 0, 0, 0)");

        page.close();
    }

    @Test
    void keyboard_arrow_keys_navigate_images_in_viewer() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> {});

        page.locator(".post-pic").first().click();
        assertThat(page.locator("#viewer-counter")).hasText("1 / 3");

        page.keyboard().press("ArrowRight");
        assertThat(page.locator("#viewer-counter")).hasText("2 / 3");

        page.keyboard().press("ArrowLeft");
        assertThat(page.locator("#viewer-counter")).hasText("1 / 3");

        page.close();
    }

    @Test
    void preserves_line_breaks_in_post_content() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

        assertThat(page.locator(".post-content")).containsText("第一行");
        assertThat(page.locator(".post-content")).containsText("第二行");
        assertThat(page.locator(".post-content")).containsText("第三行");

        Object whiteSpace = page.locator(".post-content").evaluate(
                "el => getComputedStyle(el).whiteSpace");
        org.assertj.core.api.Assertions.assertThat(whiteSpace).isEqualTo("pre-wrap");

        Object renderedText = page.locator(".post-content").evaluate(
                "el => el.textContent");
        org.assertj.core.api.Assertions.assertThat(renderedText.toString())
                .contains("第一行\n第二行\n第三行");

        page.close();
    }

    @Test
    void window_toggle_navigates_to_chat_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html");

        page.locator(".window-control.toggle").click();
        org.assertj.core.api.Assertions.assertThat(page.url()).contains("/chat/");

        page.close();
    }

    private static void sendStaticResource(HttpExchange exchange) throws IOException {
        String resourcePath = "/static" + exchange.getRequestURI().getPath();
        try (InputStream input = PostPageTest.class.getResourceAsStream(resourcePath)) {
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

    private static String multilinePostJson(String mblogId, String screenName, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"第一行\\n第二行\\n第三行","contentRaw":"第一行\\n第二行\\n第三行",
                 "source":"微博网页版","region":"广东",
                 "pics":[],"video":{"coverUrl":"","pageUrl":""},"retweeted":null,
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, createdAt, createdAt, screenName);
    }

    private static String postJson(String mblogId, String screenName, String content, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"%s","contentRaw":"%s","source":"","region":"",
                 "pics":[],"video":{"coverUrl":"","pageUrl":""},"retweeted":null,
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, content, content, createdAt, createdAt, screenName);
    }

    private static String multiPicPostJson(String mblogId, String screenName, String content, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"%s","contentRaw":"%s","source":"微博网页版","region":"广东",
                 "pics":[
                   {"pid":"p1","thumbnailWidth":0,"thumbnailHeight":0,"originalWidth":0,"originalHeight":0,
                    "thumbnailUrl":"/test-img?t1","originalUrl":"/test-img?o1"},
                   {"pid":"p2","thumbnailWidth":0,"thumbnailHeight":0,"originalWidth":0,"originalHeight":0,
                    "thumbnailUrl":"/test-img?t2","originalUrl":"/test-img?o2"},
                   {"pid":"p3","thumbnailWidth":0,"thumbnailHeight":0,"originalWidth":0,"originalHeight":0,
                    "thumbnailUrl":"/test-img?t3","originalUrl":"/test-img?o3"}
                 ],
                 "video":{"coverUrl":"","pageUrl":""},"retweeted":null,
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, content, content, createdAt, createdAt, screenName);
    }

    private static String retweetPicPostJson(String mblogId, String screenName, String content, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"%s","contentRaw":"%s","source":"微博网页版","region":"广东",
                 "pics":[],"video":{"coverUrl":"","pageUrl":""},
                 "retweeted":{"postId":2,"mblogId":"retweet-1","content":"转发的原微博内容",
                  "contentRaw":"转发的原微博内容","uid":2,"screenName":"原作者","createdAt":%d,
                  "pics":[
                    {"pid":"rp1","thumbnailWidth":0,"thumbnailHeight":0,"originalWidth":0,"originalHeight":0,
                     "thumbnailUrl":"/test-img?rt1","originalUrl":"/test-img?ro1"},
                    {"pid":"rp2","thumbnailWidth":0,"thumbnailHeight":0,"originalWidth":0,"originalHeight":0,
                     "thumbnailUrl":"/test-img?rt2","originalUrl":"/test-img?ro2"}
                  ],
                  "video":{"coverUrl":"","pageUrl":""}},
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, content, content, createdAt, createdAt, createdAt, screenName);
    }
}
