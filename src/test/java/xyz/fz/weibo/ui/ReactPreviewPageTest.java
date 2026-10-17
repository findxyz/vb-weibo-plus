package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Route;
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
            if (listQuery.get().contains("keyword=定位")) {
                sendJson(exchange, """
                        {"items":[{"mblogId":"fixture-2","createdAt":1783643400000,
                        "content":"定位摘要","blogger":{"uid":2,"screenName":"第二位博主"}}],"page":1,"size":1000,"total":1}
                        """);
                return;
            }
            if (listQuery.get().contains("keyword=")) {
                sendJson(exchange, """
                        {"items":[{"mblogId":"search-fixture","createdAt":1783643400000,
                        "content":"<b>打包搜索</b>","contentRaw":"安全 <b>打包搜索</b>",
                        "blogger":{"uid":2,"screenName":"第二位博主"}}],"page":1,"size":1000,"total":1}
                        """);
                return;
            }
            if (listQuery.get().contains("uids=2")) {
                String outerContent = listQuery.get().contains("start=2026-06-30") ? "" : "第二位博主的本地正文";
                sendJson(exchange, """
                        {"items":[{"mblogId":"fixture-2","createdAt":1783643400000,
                        "blogger":{"uid":2,"screenName":"第二位博主"},"content":"%s",
                        "source":"转发客户端","region":"发布于 北京","postUrl":"https://weibo.com/2/fixture-2",
                        "retweeted":{"screenName":"原作者","content":"<b>打包转发原文</b><br>第二行 https://example.com/retweet. <script>window.retweetAttack=1</script><svg onload='window.retweetAttack=2'></svg>",
                        "pics":[{"pid":"r1","thumbnailUrl":"/post/image?mblogId=fixture-2&pid=r1&variant=thumbnail","originalUrl":"/post/image?mblogId=fixture-2&pid=r1&variant=original"}],
                        "video":{"coverUrl":"/post/video-cover?mblogId=fixture-2&retweeted=true","pageUrl":"https://video.example.test/retweet"}}}],
                        "page":1,"size":9999,"total":1}
                        """.formatted(outerContent));
                return;
            }
            sendJson(exchange, """
                    {"items":[{"mblogId":"fixture-1","createdAt":1785889800000,
                    "blogger":{"uid":1,"screenName":"打包资源博主"},
                    "source":"<b>网页端</b>","region":"发布于 上海","postUrl":"https://weibo.com/1/fixture-1",
                    "video":{"coverUrl":"/post/video-cover?mblogId=fixture-1","pageUrl":"https://video.example.test/packaged"},
                    "content":"<b>打包后的正文</b><br>第二行 https://example.com. <a href='/n/用户'>用户</a><script>window.attack=1</script><svg onload='window.attack=2'></svg>",
                    "pics":[{"pid":"p1","thumbnailWidth":300,"thumbnailHeight":180,"thumbnailUrl":"/post/image?mblogId=fixture-1&pid=p1&variant=thumbnail","originalUrl":"/post/image?mblogId=fixture-1&pid=p1&variant=original"},
                    {"pid":"p2","thumbnailUrl":"/post/image?mblogId=fixture-1&pid=p2&variant=thumbnail"}]}],
                    "page":1,"size":9999,"total":4}
                    """);
        });
        server.createContext("/post/image", exchange -> {
            boolean broken = exchange.getRequestURI().getRawQuery().contains("pid=broken");
            byte[] body = (broken ? "Missing image" : "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'><rect width='300' height='180' fill='#f9d27c'/></svg>").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", broken ? "text/plain" : "image/svg+xml");
            exchange.sendResponseHeaders(broken ? 404 : 200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/post/video-cover", exchange -> {
            byte[] body = "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'><rect width='300' height='180' fill='#f9d27c'/></svg>".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "image/svg+xml");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/chat/image", exchange -> {
            byte[] body = "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='#d8482b'/></svg>".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "image/svg+xml");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/preview/", ReactPreviewPageTest::sendStaticResource);
        server.createContext("/weibo/login/status", exchange -> sendJson(exchange, "{\"valid\":true}"));
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
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-07-10").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.locator("article")).containsText("第二位博主的本地正文");
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-07-10 00:00:00&end=2026-07-10 23:59:59&uids=2");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06，1 条").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.locator("article")).isVisible();
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-06-30 00:00:00&end=2026-06-30 23:59:59&uids=2");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("全部博主").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-08-05").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.locator("article")).containsText("打包后的正文");
            Assertions.assertThat(listQuery.get()).doesNotContain("uids=");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void classpath_preview_locates_search_result_and_reloads_full_day() {
        try (Page page = browser.newPage()) {
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06，1 条").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true)).click();
            assertThat(page.locator(".post-card")).hasClass("post-card pure-retweet");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("高级搜索").setExact(true)).click();
            page.getByLabel("关键词", new Page.GetByLabelOptions().setExact(true)).fill("定位");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("搜索").setExact(true)).click();
            page.locator(".search-result").press("Enter");
            assertThat(page.getByRole(AriaRole.DIALOG)).hasCount(0);
            assertThat(page.locator(".post-card.flash-highlight")).containsText("第二位博主的本地正文");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-07-10").setExact(true))).hasAttribute("aria-pressed", "true");
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-07-10 00:00:00&end=2026-07-10 23:59:59&uids=2");
        }
    }

    @Test
    void classpath_preview_recovers_login_with_local_qr_fixture() {
        try (Page page = browser.newPage()) {
            page.route("**/weibo/login/status", route -> route.fulfill(new Route.FulfillOptions()
                    .setContentType("application/json").setBody("{\"valid\":false}")));
            page.route("**/weibo/login/qr", route -> {
                page.unroute("**/weibo/login/status");
                route.fulfill(new Route.FulfillOptions().setContentType("application/json").setBody("{}"));
            });
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("扫码登录").setExact(true)).click();
            assertThat(page.locator(".login-expired")).hasCount(0);
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
        }
    }

    @Test
    void classpath_preview_adds_blogger_through_local_post_fixture() {
        try (Page page = browser.newPage()) {
            AtomicReference<Boolean> added = new AtomicReference<>(false);
            page.route("**/post/bloggers**", route -> {
                if ("POST".equals(route.request().method())) {
                    Assertions.assertThat(route.request().url()).endsWith("?uid=1234567890");
                    added.set(true);
                    route.fulfill(new Route.FulfillOptions().setContentType("application/json").setBody("{}"));
                } else if (added.get()) {
                    route.fulfill(new Route.FulfillOptions().setContentType("application/json")
                            .setBody("[{\"uid\":1,\"screenName\":\"打包资源博主\"},{\"uid\":1234567890,\"screenName\":\"新博主\"}]"));
                } else {
                    route.resume();
                }
            });
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("添加博主").setExact(true)).click();
            page.getByRole(AriaRole.TEXTBOX, new Page.GetByRoleOptions().setName("UID 或主页链接")).fill("https://weibo.com/u/1234567890");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("添加").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.DIALOG)).hasCount(0);
            assertThat(page.locator(".feed-header h2")).hasText("新博主的微博");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            Assertions.assertThat(listQuery.get()).contains("uids=1234567890");
        }
    }

    @Test
    void classpath_preview_syncs_range_with_local_fixture_and_keeps_reading_day() {
        try (Page page = browser.newPage()) {
            AtomicReference<Boolean> completed = new AtomicReference<>(false);
            AtomicReference<String> rangeQuery = new AtomicReference<>();
            page.route("**/post/range?*", route -> {
                rangeQuery.set(URLDecoder.decode(route.request().url().split("\\?", 2)[1], StandardCharsets.UTF_8));
                completed.set(true);
                route.fulfill(new Route.FulfillOptions().setContentType("application/json").setBody("{}"));
            });
            page.route("**/post/calendar?uid=2", route -> {
                if (!completed.get()) route.resume();
                else route.fulfill(new Route.FulfillOptions().setContentType("application/json").setBody("""
                        {"months":[{"month":"2026-08","count":1,"days":[{"date":"2026-08-01","count":1}]},
                        {"month":"2026-07","count":1,"days":[{"date":"2026-07-10","count":1}]}]}
                        """));
            });
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("同步历史").setExact(true)).click();
            page.getByLabel("开始日期", new Page.GetByLabelOptions().setExact(true)).fill("2026-07-01");
            page.getByLabel("结束日期", new Page.GetByLabelOptions().setExact(true)).fill("2026-07-31");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("开始同步").setExact(true)).click();
            assertThat(page.locator(".sync-notice")).hasText("同步完成");
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-07-10").setExact(true))).hasAttribute("aria-pressed", "true");
            Assertions.assertThat(rangeQuery.get()).isEqualTo("uid=2&start=2026-07-01 00:00:00&end=2026-07-31 23:59:59");
            Assertions.assertThat(listQuery.get()).isEqualTo("page=1&size=9999&start=2026-07-10 00:00:00&end=2026-07-10 23:59:59&uids=2");
        }
    }

    @AfterAll
    static void stopBrowserAndServer() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        if (server != null) server.stop(0);
    }

    @Test
    void classpath_preview_searches_current_scope_and_keeps_results_as_safe_text() {
        try (Page page = browser.newPage()) {
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("高级搜索").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.DIALOG, new Page.GetByRoleOptions().setName("高级搜索"))).isVisible();
            assertThat(page.getByLabel("关键词", new Page.GetByLabelOptions().setExact(true))).isFocused();
            page.getByLabel("关键词", new Page.GetByLabelOptions().setExact(true)).fill(" 打包搜索 ");
            page.getByLabel("起止日期", new Page.GetByLabelOptions().setExact(true)).fill("2026-07-01");
            page.getByLabel("至", new Page.GetByLabelOptions().setExact(true)).fill("2026-07-31");
            page.getByLabel("关键词", new Page.GetByLabelOptions().setExact(true)).press("Enter");
            assertThat(page.locator(".search-status")).hasText("找到 1 条结果");
            assertThat(page.locator(".search-result-snippet")).hasText("安全 <b>打包搜索</b>");
            assertThat(page.locator(".search-result mark")).hasText("打包搜索");
            assertThat(page.locator(".search-result b, .search-result img, .search-result a, .search-result script")).hasCount(0);
            Assertions.assertThat(listQuery.get()).isEqualTo("keyword=打包搜索&page=1&size=1000&uids=2&start=2026-07-01 00:00:00&end=2026-07-31 23:59:59");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("关闭高级搜索")).click();
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("高级搜索").setExact(true))).isFocused();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-07-10").setExact(true))).hasAttribute("aria-pressed", "true");
        }
    }

    @Test
    void classpath_preview_filters_blogger_names_without_changing_reading_scope() {
        try (Page page = browser.newPage()) {
            List<String> queries = new ArrayList<>();
            page.onRequest(request -> {
                if (request.url().contains("/post/bloggers") || request.url().contains("/post/calendar")
                        || request.url().contains("/post/list?")) queries.add(request.url());
            });
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            List<String> selectedQueries = List.copyOf(queries);
            page.getByRole(AriaRole.SEARCHBOX, new Page.GetByRoleOptions().setName("搜索博主")).fill(" 打包 ");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true))).hasCount(0);
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("打包资源博主").setExact(true))).isVisible();
            assertThat(page.locator(".bloggers-heading")).containsText("2 位博主");
            assertThat(page.locator(".feed-header h2")).hasText("第二位博主的微博");
            assertThat(page.locator(".post-content")).hasText("第二位博主的本地正文");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-07-10").setExact(true))).hasAttribute("aria-pressed", "true");
            page.getByRole(AriaRole.SEARCHBOX, new Page.GetByRoleOptions().setName("搜索博主")).fill("不存在");
            assertThat(page.locator(".blogger-list button:visible")).hasCount(0);
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("全部博主").setExact(true))).isVisible();
            page.getByRole(AriaRole.SEARCHBOX, new Page.GetByRoleOptions().setName("搜索博主")).fill("");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true))).hasAttribute("aria-pressed", "true");
            Assertions.assertThat(queries).isEqualTo(selectedQueries);
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("全部博主").setExact(true)).click();
            assertThat(page.locator(".post-content")).containsText("打包后的正文");
        }
    }

    @Test
    void classpath_preview_opens_inline_picture_through_existing_proxy() {
        try (Page page = browser.newPage()) {
            page.context().route("https://wx3.sinaimg.cn/**", route -> route.fulfill(new Route.FulfillOptions()
                    .setStatus(403).setContentType("text/html").setBody("<h1>403 Forbidden</h1>")));
            page.route("**/post/list?**", route -> route.fulfill(new Route.FulfillOptions().setContentType("application/json")
                    .setBody("""
                            {"items":[{"mblogId":"inline-picture-fixture","createdAt":1785889800000,
                            "content":"<a href='https://wx3.sinaimg.cn/large/picture.jpg?size=large&amp;key=a%2Bb' data-pid='picture'>查看图片</a>",
                            "blogger":{"uid":1,"screenName":"图片博主"}}],"page":1,"size":9999,"total":1}
                            """)));
            page.navigate(baseUrl + "/preview/post/index.html");
            String proxyPath = "/chat/image?url=https%3A%2F%2Fwx3.sinaimg.cn%2Flarge%2Fpicture.jpg%3Fsize%3Dlarge%26key%3Da%252Bb";
            assertThat(page.locator(".post-content a")).hasAttribute("href", proxyPath);
            try (Page popup = page.waitForPopup(() -> page.locator(".post-content a").click())) {
                popup.waitForLoadState();
                assertThat(popup).hasURL(baseUrl + proxyPath);
                assertThat(popup.locator("svg")).isVisible();
                Assertions.assertThat(popup.evaluate("window.opener")).isNull();
            }
            assertThat(page).hasURL(baseUrl + "/preview/post/index.html");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-08-05").setExact(true))).hasAttribute("aria-pressed", "true");
        }
    }

    @Test
    void classpath_preview_loads_avatars_through_existing_image_proxy() {
        try (Page page = browser.newPage()) {
            List<String> directRequests = new ArrayList<>();
            List<String> proxyRequests = new ArrayList<>();
            page.onRequest(request -> {
                if (request.url().startsWith("https://avatar.example.test/")) directRequests.add(request.url());
                if (request.url().startsWith(baseUrl + "/chat/image?")) proxyRequests.add(request.url());
            });
            page.route("https://avatar.example.test/**", route -> route.fulfill(new Route.FulfillOptions()
                    .setStatus(403).setContentType("text/html").setBody("Forbidden")));
            page.route("**/post/bloggers", route -> route.fulfill(new Route.FulfillOptions().setContentType("application/json")
                    .setBody("[{\"uid\":1,\"screenName\":\"头像博主\",\"avatar\":\"https://avatar.example.test/valid.svg?size=48&variant=small\"}]")));
            page.route("**/post/list?**", route -> route.fulfill(new Route.FulfillOptions().setContentType("application/json")
                    .setBody("""
                            {"items":[{"mblogId":"avatar-fixture","createdAt":1785889800000,"content":"头像正文",
                            "blogger":{"uid":1,"screenName":"头像博主","avatar":"https://avatar.example.test/valid.svg?size=48&variant=small"}}],
                            "page":1,"size":9999,"total":1}
                            """)));
            page.navigate(baseUrl + "/preview/post/index.html");
            page.waitForFunction("document.querySelector('.post-avatar img')?.naturalWidth === 48 && document.querySelector('.blogger-list .blogger-avatar img')?.naturalWidth === 48");
            assertThat(page.locator(".post-avatar img")).hasAttribute("src", "/chat/image?url=https%3A%2F%2Favatar.example.test%2Fvalid.svg%3Fsize%3D48%26variant%3Dsmall");
            assertThat(page.locator(".post-avatar")).hasAttribute("href", "https://weibo.com/u/1");
            assertThat(page.locator(".blogger-row a")).hasCount(0);
            Assertions.assertThat(directRequests).isEmpty();
            Assertions.assertThat(proxyRequests).isNotEmpty().allMatch(url -> url.contains("%26variant%3Dsmall"));
        }
    }

    @Test
    void classpath_preview_reads_metadata_and_opens_original_and_homepage_safely() {
        try (Page page = browser.newPage()) {
            List<String> errors = new ArrayList<>();
            page.onPageError(errors::add);
            page.context().route("https://weibo.com/**", route -> route.fulfill(new Route.FulfillOptions()
                    .setContentType("text/html").setBody("<h1>Weibo fixture</h1>")));
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-region")).hasText("发布于 上海");
            assertThat(page.locator(".post-source")).hasText("<b>网页端</b>");
            assertThat(page.locator(".post-source b")).hasCount(0);
            assertThat(page.locator(".post-source")).hasCSS("font-size", "12px");
            assertThat(page.locator(".blogger-row a")).hasCount(0);
            for (String selector : List.of(".post-avatar", ".post-link")) {
                assertThat(page.locator(selector)).hasAttribute("rel", "noopener");
                try (Page popup = page.waitForPopup(() -> page.locator(selector).click())) {
                    popup.waitForLoadState();
                    assertThat(popup).hasURL(selector.equals(".post-avatar") ? "https://weibo.com/u/1" : "https://weibo.com/1/fixture-1");
                    Assertions.assertThat(popup.evaluate("window.opener")).isNull();
                }
            }
            assertThat(page).hasURL(baseUrl + "/preview/post/index.html");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-08-05").setExact(true))).hasAttribute("aria-pressed", "true");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06，1 条").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true)).click();
            assertThat(page.locator("article")).hasClass("post-card pure-retweet");
            assertThat(page.locator(".post-avatar")).hasCount(0);
            assertThat(page.locator(".post-source")).hasText("转发客户端");
            assertThat(page.locator(".post-region")).hasText("发布于 北京");
            assertThat(page.locator(".post-link")).hasAttribute("href", "https://weibo.com/2/fixture-2");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void classpath_preview_reads_video_covers_and_opens_an_isolated_video_page() {
        try (Page page = browser.newPage()) {
            List<String> coverRequests = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            page.onRequest(request -> {
                if (request.url().contains("/post/video-cover?")) coverRequests.add(request.url());
            });
            page.onPageError(errors::add);
            page.context().route("https://video.example.test/**", route -> route.fulfill(new Route.FulfillOptions()
                    .setContentType("text/html").setBody("<h1>Video fixture</h1>")));
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.getByRole(AriaRole.LINK, new Page.GetByRoleOptions().setName("播放微博视频").setExact(true))).hasAttribute("rel", "noopener");
            page.waitForFunction("document.querySelector('.post-video img').naturalWidth === 300");
            assertThat(page.locator(".post-video img")).hasCSS("width", "320px");
            assertThat(page.locator(".post-video img")).hasAttribute("loading", "lazy");
            try (Page popup = page.waitForPopup(() -> page.getByRole(AriaRole.LINK,
                    new Page.GetByRoleOptions().setName("播放微博视频").setExact(true)).click())) {
                popup.waitForLoadState();
                assertThat(popup).hasURL("https://video.example.test/packaged");
                Assertions.assertThat(popup.evaluate("window.opener")).isNull();
            }
            Assertions.assertThat(page.url()).isEqualTo(baseUrl + "/preview/post/index.html");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.LINK, new Page.GetByRoleOptions().setName("播放转发视频").setExact(true))).hasAttribute("href", "https://video.example.test/retweet");
            page.waitForFunction("document.querySelector('.post-retweet .post-video img').naturalWidth === 300");
            assertThat(page.locator(".post-retweet .post-video img")).hasAttribute("src", "/post/video-cover?mblogId=fixture-2&retweeted=true");
            Assertions.assertThat(coverRequests).hasSize(2);
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void classpath_preview_views_originals_cycles_and_restores_focus_without_navigation() {
        try (Page page = browser.newPage()) {
            List<String> imageRequests = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            page.onRequest(request -> {
                if (request.url().contains("/post/image?")) imageRequests.add(request.url());
            });
            page.onPageError(errors::add);
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-pic")).hasCount(2);
            Assertions.assertThat(imageRequests).noneMatch(url -> url.contains("variant=original"));
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("查看微博图片 1").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.DIALOG, new Page.GetByRoleOptions().setName("查看原图"))).isVisible();
            assertThat(page.locator(".viewer-counter")).hasText("1 / 2");
            assertThat(page.locator(".image-viewer img")).hasAttribute("src", "/post/image?mblogId=fixture-1&pid=p1&variant=original");
            page.waitForFunction("document.querySelector('.image-viewer img').naturalWidth === 300");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("下一张")).click();
            assertThat(page.locator(".viewer-counter")).hasText("2 / 2");
            assertThat(page.locator(".image-viewer img")).hasAttribute("src", "/post/image?mblogId=fixture-1&pid=p2&variant=thumbnail");
            page.keyboard().press("ArrowRight");
            assertThat(page.locator(".viewer-counter")).hasText("1 / 2");
            page.keyboard().press("Escape");
            assertThat(page.locator(".image-viewer")).hasCount(0);
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("查看微博图片 1").setExact(true))).isFocused();
            Assertions.assertThat(page.url()).isEqualTo(baseUrl + "/preview/post/index.html");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("查看转发微博图片 1").setExact(true)).click();
            assertThat(page.locator(".image-viewer img")).hasAttribute("src", "/post/image?mblogId=fixture-2&pid=r1&variant=original");
            assertThat(page.locator(".viewer-counter")).hasCount(0);
            page.keyboard().press("Escape");
            Assertions.assertThat(errors).isEmpty();
        }
    }

    @Test
    void classpath_preview_reads_thumbnail_images_and_hides_failed_cells() {
        try (Page page = browser.newPage()) {
            List<String> imageRequests = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            page.onRequest(request -> {
                if (request.url().contains("/post/image?")) imageRequests.add(request.url());
            });
            page.onPageError(errors::add);
            page.route("**/post/image?*pid=p2*", route -> route.fulfill(new Route.FulfillOptions()
                    .setStatus(404).setContentType("text/plain").setBody("Missing image")));
            page.navigate(baseUrl + "/preview/post/index.html");
            assertThat(page.locator(".post-pic[hidden]")).hasCount(1);
            assertThat(page.locator(".post-pic[hidden]")).hasCSS("display", "none");
            assertThat(page.getByRole(AriaRole.IMG, new Page.GetByRoleOptions().setName("微博图片").setExact(true))).hasCount(1);
            assertThat(page.locator(".post-pic").first()).hasCSS("width", "120px");
            assertThat(page.locator(".post-pic img").first()).hasAttribute("loading", "lazy");
            assertThat(page.locator(".post-pic img").first()).hasAttribute("decoding", "async");
            page.waitForFunction("document.querySelector('.post-pic img').naturalWidth === 300");
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("第二位博主").setExact(true)).click();
            assertThat(page.getByRole(AriaRole.IMG, new Page.GetByRoleOptions().setName("转发微博图片").setExact(true))).hasCount(1);
            assertThat(page.locator(".post-retweet-pic")).hasCSS("width", "100px");
            page.waitForFunction("document.querySelector('.post-retweet-pic img').naturalWidth === 300");
            Assertions.assertThat(imageRequests).hasSize(3).allMatch(url -> url.contains("variant=thumbnail"));
            Assertions.assertThat(errors).isEmpty();
        }
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
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-06-30").setExact(true))).hasAttribute("aria-pressed", "true");
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
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("全部博主").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("2026-08-05").setExact(true))).hasAttribute("aria-pressed", "true");
            assertThat(page.getByLabel("博文总数")).hasText("共 4 条");
            assertThat(page.getByLabel("博文总数")).hasCSS("font-size", "12px");
            assertThat(page.getByLabel("博文总数")).hasCSS("font-variant-numeric", "tabular-nums");
            assertThat(page.locator(".feed-header").getByLabel("博文总数")).isVisible();
            assertThat(page.locator(".title-logo img")).isVisible();
            Assertions.assertThat(page.locator(".title-logo img").evaluate("img => img.naturalWidth > 0")).isEqualTo(true);
            assertThat(page.locator(".post-avatar")).hasText("打");
            assertThat(page.locator(".post-card")).hasCSS("max-width", "720px");
            assertThat(page.locator(".post-card")).hasCSS("box-shadow", "none");
            assertThat(page.locator(".posts")).hasCSS("overflow-y", "auto");
            assertThat(page.locator(".selected")).hasCount(0);
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
