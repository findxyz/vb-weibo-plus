package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.WaitUntilState;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
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
    // 不等待 load 事件：index.html 引用的 Google Fonts 外链在测试环境无外网时会挂起 load，
    // 导致依赖 navigate 阶段自发请求的 waitForResponse 超时。DOMCONTENTLOADED 后 defer 脚本已执行。
    private static final Page.NavigateOptions NAVIGATE_OPTIONS =
            new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED);
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
                      {"month":"2026-08","count":5,"days":[
                        {"date":"2026-08-05","count":1},
                        {"date":"2026-08-04","count":1},
                        {"date":"2026-08-03","count":1},
                        {"date":"2026-08-02","count":1},
                        {"date":"2026-08-01","count":1}
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
            if (query != null && query.contains("keyword=")) {
                String decoded = URLDecoder.decode(query, StandardCharsets.UTF_8);
                int kwIdx = decoded.indexOf("keyword=");
                String keyword = decoded.substring(kwIdx + "keyword=".length());
                int ampIdx = keyword.indexOf('&');
                if (ampIdx >= 0) keyword = keyword.substring(0, ampIdx);
                keyword = keyword.trim();
                if (keyword.equals("不存在的内容关键字")) {
                    items = "";
                    total = 0;
                } else if (keyword.equals("八月三日")) {
                    items = postJson("post-aug-03", "第一位", "八月三日的内容，命中搜索词", 1785686400000L);
                    total = 1;
                } else if (keyword.equals("多条结果")) {
                    items = postJson("post-search-2", "第一位", "多条结果的第一条", 1785686400000L);
                    items = items + "," + postJson("post-search-3", "第二位", "多条结果的第二条", 1785600000000L);
                    total = 2;
                } else if (keyword.equals("大量结果")) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < 30; i++) {
                        if (i > 0) sb.append(",");
                        sb.append(postJson("post-many-" + i, "第一位",
                                "大量结果第" + i + "条，内容较长以便撑高浮层验证滚动与高度限制", 1785686400000L - (long) i * 1000));
                    }
                    items = sb.toString();
                    total = 30;
                } else if (keyword.equals("超限")) {
                    items = postJson("post-search-4", "第一位", "超限内容", 1785686400000L);
                    total = 1001;
                } else {
                    items = "";
                    total = 0;
                }
            } else if (query != null && query.contains("start=2026-08-05")) {
                items = multilinePostJson("post-aug-05", "第一位", 1783612800000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-08-04")) {
                items = emojiPostJson("post-aug-04", "第一位", 1783612800000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-08-03")) {
                items = retweetPicPostJson("post-aug-03", "第二位", "八月三日的微博", 1783526400000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-08-02")) {
                items = pureRetweetPostJson("post-aug-02", "第一位", 1783440000000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-08-01")) {
                items = videoPostJson("aug-01", "第二位", "八月一日的视频微博", 1783353600000L);
                total = 1;
            } else if (query != null && query.contains("start=2026-07-10")) {
                items = multiPicPostJson("post-jul-10", "第一位", "七月十日的内容", 1783612800000L);
                total = 1;
            } else {
                items = multilinePostJson("post-default", "第一位", 1783612800000L);
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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        assertThat(page.locator(".blogger-row.all-bloggers")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator("#current-filter")).hasText("全部微博");
        assertThat(page.locator(".blogger-row")).hasCount(3);
        assertThat(page.locator(".month-group")).hasCount(2);
        assertThat(page.locator(".month-group.open")).hasCount(1);
        assertThat(page.locator(".date-item.active")).hasCount(1);
        assertThat(page.locator(".date-item.active")).hasAttribute("data-date", "2026-08-05");

        page.close();
    }

    @Test
    void loads_posts_for_the_selected_day_without_pagination() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-05"),
                () -> {});

        assertThat(page.locator(".post-card")).hasCount(1);
        assertThat(page.locator(".post-content")).containsText("第一行");
        assertThat(page.locator("#feed-count")).hasText("共 1 条");
        assertThat(page.locator("#pagination")).hasCount(0);
        assertThat(page.locator(".feed-filters")).hasCount(0);

        page.close();
    }

    @Test
    void switching_a_day_reloads_the_feed_with_the_new_date_range() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-05"),
                () -> {});

        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> page.locator(".date-item[data-date='2026-08-04']").click());

        assertThat(page.locator(".date-item[data-date='2026-08-04']")).hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".date-item[data-date='2026-08-05']")).not().hasClass(java.util.regex.Pattern.compile("active"));
        assertThat(page.locator(".post-content")).containsText("加油");

        page.close();
    }

    @Test
    void switching_a_blogger_refreshes_the_date_tree() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        assertThat(page.locator("#login-expired")).isVisible();
        page.locator("#login-qr").click();
        assertThat(page.locator("#login-qr")).isEnabled();
        assertThat(page.locator("#bloggers-state")).containsText("登录请求失败");

        page.close();
    }

    @Test
    void emoji_avatar_is_not_oversized() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        Object fontSize = page.locator(".blogger-avatar").first().evaluate(
                "el => getComputedStyle(el).fontSize");
        org.assertj.core.api.Assertions.assertThat(fontSize).isEqualTo("18px");

        Object lineHeight = page.locator(".blogger-avatar").first().evaluate(
                "el => getComputedStyle(el).lineHeight");
        org.assertj.core.api.Assertions.assertThat(lineHeight).isEqualTo("18px");

        page.close();
    }

    @Test
    void multi_image_post_opens_viewer_with_prev_next_navigation() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

        Object bg = page.locator(".post-pic").first().evaluate(
                "el => getComputedStyle(el).backgroundColor");
        // 新设计有意给图片格填充纸色背景（--paper-tint），断言为纸色而非透明或旧版灰底
        org.assertj.core.api.Assertions.assertThat(bg).isEqualTo("rgb(245, 238, 223)");

        page.close();
    }

    @Test
    void post_picture_reserves_its_intrinsic_size_before_lazy_loading() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

        assertThat(page.locator(".post-pic img").first()).hasAttribute("width", "1200");
        assertThat(page.locator(".post-pic img").first()).hasAttribute("height", "675");

        page.close();
    }

    @Test
    void keyboard_arrow_keys_navigate_images_in_viewer() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

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
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-05"),
                () -> page.locator(".date-item[data-date='2026-08-05']").click());

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
    void inline_emoji_images_are_sized_like_chat_emoji() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-04"),
                () -> page.locator(".date-item[data-date='2026-08-04']").click());

        assertThat(page.locator(".post-content img")).hasCount(1);
        Object fontSize = page.locator(".post-content").evaluate(
                "el => parseFloat(getComputedStyle(el).fontSize)");
        Object imgWidth = page.locator(".post-content img").evaluate(
                "img => parseFloat(getComputedStyle(img).width)");
        Object imgHeight = page.locator(".post-content img").evaluate(
                "img => parseFloat(getComputedStyle(img).height)");

        double fs = ((Number) fontSize).doubleValue();
        double expected = fs * 1.3;
        // 浏览器亚像素布局会使 1.3em 解析为 20.7969px 而非 20.8px，用容差比较
        org.assertj.core.api.Assertions.assertThat(((Number) imgWidth).doubleValue())
                .isCloseTo(expected, org.assertj.core.data.Offset.offset(0.5));
        org.assertj.core.api.Assertions.assertThat(((Number) imgHeight).doubleValue())
                .isCloseTo(expected, org.assertj.core.data.Offset.offset(0.5));

        page.close();
    }

    @Test
    void post_pic_uses_original_url_for_display() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.locator(".month-group[data-month='2026-07'] .month-header").click();
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-07-10"),
                () -> page.locator(".date-item[data-date='2026-07-10']").click());

        String src = page.locator(".post-pic img").first().getAttribute("src");
        org.assertj.core.api.Assertions.assertThat(src).contains("/test-img?o1");

        page.close();
    }

    @Test
    void retweet_pic_uses_original_url_for_display() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-03"),
                () -> page.locator(".date-item[data-date='2026-08-03']").click());

        String src = page.locator(".post-retweet-pic img").first().getAttribute("src");
        org.assertj.core.api.Assertions.assertThat(src).contains("/test-img?ro1");

        page.close();
    }

    @Test
    void video_play_button_is_centered_on_cover() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-01"),
                () -> page.locator(".date-item[data-date='2026-08-01']").click());
        page.waitForTimeout(500);

        assertThat(page.locator("#post-aug-01")).hasCount(1);
        assertThat(page.locator("#post-aug-01 .post-video")).hasCount(2);
        Locator topVideo = page.locator("#post-aug-01 > .post-body > .post-video");
        assertThat(topVideo).hasCount(1);
        assertThat(topVideo.locator("img")).hasCount(1);
        // 播放按钮存在
        assertThat(topVideo.locator(".post-video-play")).hasCount(1);

        // 播放按钮居中：其中心点应接近封面图中心点
        String diff = (String) topVideo.evaluate(
                "el => { const img = el.querySelector('img'); const play = el.querySelector('.post-video-play');" +
                "if (!img || !play) return '999,999';" +
                "const ir = img.getBoundingClientRect(); const pr = play.getBoundingClientRect();" +
                "return Math.abs((ir.x + ir.width / 2) - (pr.x + pr.width / 2)) + ',' +" +
                "Math.abs((ir.y + ir.height / 2) - (pr.y + pr.height / 2)); }");
        String[] parts = diff.split(",");
        org.assertj.core.api.Assertions.assertThat(Double.parseDouble(parts[0])).isLessThan(3.0);
        org.assertj.core.api.Assertions.assertThat(Double.parseDouble(parts[1])).isLessThan(3.0);

        page.close();
    }

    @Test
    void retweet_block_renders_video_cover_with_play_button() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-01"),
                () -> page.locator(".date-item[data-date='2026-08-01']").click());

        // 转发块中有视频封面和播放按钮
        assertThat(page.locator("#post-aug-01 .post-retweet .post-video img")).hasCount(1);
        assertThat(page.locator("#post-aug-01 .post-retweet .post-video-play")).hasCount(1);

        // 转发视频链接指向正确的 pageUrl
        String href = page.locator("#post-aug-01 .post-retweet .post-video").getAttribute("href");
        org.assertj.core.api.Assertions.assertThat(href).isEqualTo("https://video.weibo.com/show?fid=rttest");

        page.close();
    }

    @Test
    void post_content_width_is_constrained_and_not_overly_wide() {
        Page page = browser.newPage();
        page.setViewportSize(1600, 900);
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-05"),
                () -> {});

        Object postsWidth = page.locator(".posts").evaluate(
                "el => el.clientWidth");
        Object postCardWidth = page.locator(".post-card").first().evaluate(
                "el => el.clientWidth");
        double pw = ((Number) postsWidth).doubleValue();
        double cw = ((Number) postCardWidth).doubleValue();

        org.assertj.core.api.Assertions.assertThat(cw).isLessThanOrEqualTo(760.0);
        org.assertj.core.api.Assertions.assertThat(cw).isLessThan(pw);

        page.close();
    }

    @Test
    void pure_retweet_post_hides_blogger_avatar() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-05"),
                () -> {});
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-02"),
                () -> page.locator(".date-item[data-date='2026-08-02']").click());

        assertThat(page.locator(".post-card")).hasCount(1);
        assertThat(page.locator(".post-card.pure-retweet")).hasCount(1);
        assertThat(page.locator(".post-card .post-avatar")).hasCount(0);
        assertThat(page.locator(".post-retweet")).hasCount(1);
        assertThat(page.locator(".post-retweet-author")).hasText("@原作者");

        page.close();
    }

    @Test
    void window_toggle_navigates_to_chat_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator(".window-control.toggle").click();
        org.assertj.core.api.Assertions.assertThat(page.url()).contains("/chat/");

        page.close();
    }

    @Test
    void search_button_opens_overlay_with_default_date_range() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        assertThat(page.locator("#search-open")).isVisible();
        page.locator("#search-open").click();
        assertThat(page.locator("#search-overlay")).isVisible();

        // 默认起止：2010-01-01 至今
        assertThat(page.locator("#search-start")).hasValue("2010-01-01");
        String today = java.time.LocalDate.now().toString();
        assertThat(page.locator("#search-end")).hasValue(today);

        page.close();
    }

    @Test
    void search_sends_keyword_uids_and_date_range_to_post_list() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("八月三日");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        String query = lastListQuery.get();
        org.assertj.core.api.Assertions.assertThat(query).contains("keyword=");
        org.assertj.core.api.Assertions.assertThat(query).contains("start=2010-01-01");
        org.assertj.core.api.Assertions.assertThat(query).contains("page=1");
        org.assertj.core.api.Assertions.assertThat(query).contains("size=1000");
        // 默认「全部博主」时 uids 不传
        org.assertj.core.api.Assertions.assertThat(query).doesNotContain("uids");

        page.close();
    }

    @Test
    void search_results_show_highlighted_snippet() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("八月三日");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        assertThat(page.locator(".search-result")).hasCount(1);
        // 片段中命中词被 <mark> 包裹
        assertThat(page.locator(".search-result mark")).hasCount(1);
        assertThat(page.locator(".search-result mark")).hasText("八月三日");

        page.close();
    }

    @Test
    void clicking_result_closes_overlay_and_jumps_to_card() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("八月三日");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        // 结果 createdAt=1785686400000L 对应 2026-08-03，点击后应加载该日并高亮卡片
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("start=2026-08-03"),
                () -> page.locator(".search-result").first().click());

        assertThat(page.locator("#search-overlay")).isHidden();
        assertThat(page.locator(".date-item.active")).hasAttribute("data-date", "2026-08-03");
        // 该日微博已加载（卡片 id 为 post- + mblogId）
        assertThat(page.locator("#post-post-aug-03")).hasCount(1);
        // 卡片被添加闪烁高亮 class（requestAnimationFrame 后触发，需等待）
        page.waitForFunction(
                "el => el && el.classList.contains('flash-highlight')",
                page.locator("#post-post-aug-03").elementHandle());

        page.close();
    }

    @Test
    void empty_search_results_show_no_match_message() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("不存在的内容关键字");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        assertThat(page.locator(".search-result")).hasCount(0);
        assertThat(page.locator("#search-results")).containsText("未找到匹配微博");

        page.close();
    }

    @Test
    void over_limit_results_show_limit_message() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("超限");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        assertThat(page.locator("#search-status")).containsText("已达上限");

        page.close();
    }

    @Test
    void many_results_do_not_overflow_viewport() {
        Page page = browser.newPage();
        page.setViewportSize(1280, 800);
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        page.locator("#search-keyword").fill("大量结果");
        page.waitForResponse(
                item -> item.url().contains("/post/list") && item.url().contains("keyword="),
                () -> page.locator("#search-submit").click());

        assertThat(page.locator(".search-result")).hasCount(30);

        // 浮层 window 不应超出视口高度
        double winHeight = ((Number) page.locator(".search-overlay-window").evaluate(
                "el => el.getBoundingClientRect().height")).doubleValue();
        org.assertj.core.api.Assertions.assertThat(winHeight).isLessThanOrEqualTo(800.0);

        // body 区域应可滚动（scrollHeight > clientHeight），而非把浮层撑高
        double scrollH = ((Number) page.locator(".search-overlay-body").evaluate(
                "el => el.scrollHeight")).doubleValue();
        double clientH = ((Number) page.locator(".search-overlay-body").evaluate(
                "el => el.clientHeight")).doubleValue();
        org.assertj.core.api.Assertions.assertThat(scrollH).isGreaterThan(clientH);

        page.close();
    }

    @Test
    void esc_closes_search_overlay() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        assertThat(page.locator("#search-overlay")).isVisible();
        page.keyboard().press("Escape");
        assertThat(page.locator("#search-overlay")).isHidden();

        page.close();
    }

    @Test
    void clicking_overlay_backdrop_does_not_close_overlay() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/post/index.html", NAVIGATE_OPTIONS);

        page.locator("#search-open").click();
        assertThat(page.locator("#search-overlay")).isVisible();
        // 点击遮罩区域不关闭浮层，与添加博主、同步历史一致
        page.mouse().click(5, 5);
        assertThat(page.locator("#search-overlay")).isVisible();

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

    private static String emojiPostJson(String mblogId, String screenName, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"加油 <img src=\\"https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0d/2022_Keepgoing_mobile.png\\" alt=\\"[加油]\\"> 冲啊",
                 "contentRaw":"加油 [加油] 冲啊",
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
                   {"pid":"p1","thumbnailWidth":300,"thumbnailHeight":169,"originalWidth":1200,"originalHeight":675,
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

    private static String videoPostJson(String mblogId, String screenName, String content, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"%s","contentRaw":"%s","source":"微博网页版","region":"广东",
                 "pics":[],
                 "video":{"coverUrl":"/test-img?vcover","pageUrl":"https://video.weibo.com/show?fid=test"},
                 "retweeted":{"postId":2,"mblogId":"retweet-vid","content":"转发的视频微博",
                  "contentRaw":"转发的视频微博","uid":2,"screenName":"视频原作者","createdAt":%d,
                  "pics":[],
                  "video":{"coverUrl":"/test-img?rtvcover","pageUrl":"https://video.weibo.com/show?fid=rttest"}},
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, content, content, createdAt, createdAt, createdAt, screenName);
    }

    private static String pureRetweetPostJson(String mblogId, String screenName, long createdAt) {
        return """
                {"mblogId":"%s","postId":1,"uid":1,"postUrl":"https://weibo.com/1",
                 "content":"","contentRaw":"","source":"微博网页版","region":"广东",
                 "pics":[],"video":{"coverUrl":"","pageUrl":""},
                 "retweeted":{"postId":2,"mblogId":"retweet-1","content":"转发的原微博内容",
                  "contentRaw":"转发的原微博内容","uid":2,"screenName":"原作者","createdAt":%d,
                  "pics":[],"video":{"coverUrl":"","pageUrl":""}},
                 "repostsCount":0,"commentsCount":0,"attitudesCount":0,
                 "createdAt":%d,"savedAt":%d,
                 "blogger":{"uid":1,"screenName":"%s","avatar":"","profileUrl":"/u/1","verified":false}}
                """.formatted(mblogId, createdAt, createdAt, createdAt, screenName);
    }
}
