package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Response;
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
import java.util.concurrent.atomic.AtomicReference;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

class GroupChatPageTest {

    private static HttpServer server;
    private static Playwright playwright;
    private static Browser browser;
    private static String baseUrl;
    private static final AtomicInteger groupListRequests = new AtomicInteger();
    private static final AtomicInteger latestPageRequests = new AtomicInteger();
    private static final AtomicInteger earlierPageRequests = new AtomicInteger();
    private static final AtomicInteger historyPageRequests = new AtomicInteger();
    private static final AtomicInteger historyBeforeRequests = new AtomicInteger();
    private static final AtomicInteger historyAfterRequests = new AtomicInteger();
    private static final AtomicInteger mediaRequests = new AtomicInteger();
    private static final AtomicReference<String> lastHistoryQuery = new AtomicReference<>();
    private static final AtomicBoolean failGroups = new AtomicBoolean();
    private static final AtomicBoolean failMessages = new AtomicBoolean();
    private static final AtomicBoolean delayEarlierHistory = new AtomicBoolean();
    private static final AtomicBoolean failSend = new AtomicBoolean();
    private static final AtomicBoolean failSendSync = new AtomicBoolean();
    private static final AtomicInteger sendRequests = new AtomicInteger();
    private static final AtomicBoolean loginInvalid = new AtomicBoolean();
    private static final AtomicInteger loginStatusRequests = new AtomicInteger();
    private static final AtomicInteger qrLoginRequests = new AtomicInteger();
    private static final AtomicBoolean failQrLogin = new AtomicBoolean();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/groups", exchange -> {
            if (failGroups.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            boolean refreshed = groupListRequests.incrementAndGet() > 1;
            sendJson(exchange, """
                [
                  {"gid":101,"name":"周末活动讨论组","avatar":"https://example.test/group.png","memberCount":12,
                   "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1,
                   "latestSenderName":"小凯","latestMessage":"大家周末有空吗？"},
                  {"gid":202,"name":"LinkNow","avatar":"","memberCount":3,
                   "maxMember":200,"ownerId":2,"admins":[9],"summary":"测试群","groupType":1,
                   "latestSenderName":"%s","latestMessage":"%s"}
                ]
                """.formatted(refreshed ? "媒体用户" : "阿呆",
                    refreshed ? "新的群消息" : "收到"));
        });
        server.createContext("/chat/messages/cursor", exchange -> {
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
                if (query.contains("beforeCreatedAt") || query.contains("beforeMid")) {
                    exchange.sendResponseHeaders(400, -1);
                    exchange.close();
                    return;
                }
                String baseMessages = mediaMessageJson(4, 1, "分享图片",
                        "/chat/media?gid=202&mid=4&variant=preview",
                        "/chat/media?gid=202&mid=4&variant=original", "") + ","
                        + mediaMessageJson(5, 13, "分享视频",
                        "/chat/media?gid=202&mid=5&variant=preview", "",
                        "/chat/media?gid=202&mid=5&variant=video") + ","
                        + systemMessageJson(6, "涉及资金问题请务必提高警惕，谨防诈骗。查看案例") + ","
                        + mediaMessageJson(7, 1, "第二张图片",
                        "/chat/media?gid=202&mid=7&variant=preview",
                        "/chat/media?gid=202&mid=7&variant=original", "") + ","
                        + mediaMessageJson(8, 0,
                        "微博链接 http://weibo.com/1560906700/RaX1Tdqh7", "", "", "") + ","
                        + fileMessageJson(10, "海外即插即充流程.md",
                        "/chat/media?gid=202&mid=10&variant=file") + ","
                        + weiboMessageJson(11, "tombkeeper", "如果未来中国也被迫要腾笼换鸟，希望至少能先把还活着的大力推行和鼓吹计划生育的人先用中华民族传统方法处理一下。",
                        "http://weibo.com/1401527553/Rbd0OxIhB") + ","
                        + stickerMessageJson(12, "https://wx4.sinaimg.cn/large/sticker.jpg");
                String messages = sendRequests.get() > 0
                        ? "{\"mid\":9,\"gid\":202,\"msgType\":321,\"msgTypeName\":\"普通消息\","
                        + "\"mediaType\":0,\"senderId\":1,\"senderName\":\"测试者\",\"senderAvatar\":\"\","
                        + "\"text\":\"刚发出的消息\",\"urlObjects\":[],\"picInfos\":[],\"template\":\"\","
                        + "\"templateData\":{},\"recallMids\":[],\"recallBy\":\"\","
                        + "\"createdAt\":9000,\"savedAt\":9000,"
                        + "\"previewUrl\":\"\",\"originalUrl\":\"\",\"videoUrl\":\"\"},"
                        + baseMessages
                        : baseMessages;
                sendJson(exchange, cursorMessagesJson(false, null, null, messages));
                return;
            }
            if (!query.contains("gid=101")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            if (query.contains("beforeCreatedAt=5000") && query.contains("beforeMid=5")) {
                historyBeforeRequests.incrementAndGet();
                sendJson(exchange, cursorMessagesJson(true, 3_000L, 3L,
                        messageJson(4, "小凯", "准备登山鞋", 4000) + ","
                                + messageJson(3, "飞飞", "确认集合地点", 3000)));
                return;
            }
            if (query.contains("afterCreatedAt=5000") && query.contains("afterMid=5")) {
                historyAfterRequests.incrementAndGet();
                sendJson(exchange, afterCursorMessagesJson(true, 7_000L, 7L,
                        messageJson(7, "路路", "山顶见", 7000) + ","
                                + messageJson(6, "阿呆", "我也参加", 6000)));
                return;
            }
            if (query.contains("beforeCreatedAt=3000") && query.contains("beforeMid=3")) {
                historyBeforeRequests.incrementAndGet();
                if (delayEarlierHistory.getAndSet(false)) {
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                    }
                }
                sendJson(exchange, cursorMessagesJson(false, null, null,
                        messageJson(2, "小凯", "更早的上下文", 2000)));
                return;
            }
            if (query.contains("afterCreatedAt=7000") && query.contains("afterMid=7")) {
                historyAfterRequests.incrementAndGet();
                sendJson(exchange, afterCursorMessagesJson(false, null, null,
                        messageJson(8, "飞飞", "更新的上下文", 8000)));
                return;
            }
            if (query.contains("beforeCreatedAt=9000") && query.contains("beforeMid=9")) {
                sendJson(exchange, cursorMessagesJson(false, null, null,
                        messageJson(8, "飞飞", "上一条消息", 8000)));
                return;
            }
            if (query.contains("afterCreatedAt=9000") && query.contains("afterMid=9")) {
                sendJson(exchange, afterCursorMessagesJson(false, null, null, ""));
                return;
            }
            if (query.contains("beforeCreatedAt=91000") && query.contains("beforeMid=91")) {
                historyBeforeRequests.incrementAndGet();
                sendJson(exchange, cursorMessagesJson(false, null, null,
                        messageRangeJson(41, 90)));
                return;
            }
            if (query.contains("afterCreatedAt=91000") && query.contains("afterMid=91")) {
                historyAfterRequests.incrementAndGet();
                sendJson(exchange, afterCursorMessagesJson(true, 141_000L, 141L,
                        messageRangeJson(92, 141)));
                return;
            }
            if (query.contains("afterCreatedAt=141000") && query.contains("afterMid=141")) {
                historyAfterRequests.incrementAndGet();
                sendJson(exchange, afterCursorMessagesJson(true, 191_000L, 191L,
                        messageRangeJson(142, 191)));
                return;
            }
            if (query.contains("afterCreatedAt=191000") && query.contains("afterMid=191")) {
                historyAfterRequests.incrementAndGet();
                sendJson(exchange, afterCursorMessagesJson(false, null, null,
                        messageRangeJson(192, 211)));
                return;
            }
            if (query.contains("beforeCreatedAt=1000") && query.contains("beforeMid=1")) {
                earlierPageRequests.incrementAndGet();
                sendJson(exchange, cursorMessagesJson(false, null, null,
                        messageJson(0, "路路", "最早消息", 500)));
                return;
            }
            if (query.contains("beforeCreatedAt") || query.contains("beforeMid")) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            int requestNumber = latestPageRequests.incrementAndGet();
            boolean refreshed = requestNumber > 1;
            String newMessage = requestNumber > 2
                    ? messageJson(4, "小凯", "点击后消息", 4000) + ","
                            + messageJson(3, "阿呆", "刷新后消息", 3000) + ","
                    : refreshed ? messageJson(3, "阿呆", "刷新后消息", 3000) + "," : "";
            sendJson(exchange, cursorMessagesJson(true,
                    refreshed ? 2_000L : 1_000L, refreshed ? 2L : 1L,
                    newMessage
                            + messageJson(2, "飞飞", "较新消息", 2000) + ","
                            + messageJson(1, "小凯", "较早消息", 1000)));
        });
        server.createContext("/chat/messages/send", exchange -> {
            sendRequests.incrementAndGet();
            if (failSend.get()) {
                exchange.sendResponseHeaders(502, -1);
                exchange.close();
                return;
            }
            if (failSendSync.get()) {
                byte[] body = """
                        {"code":409,"msg":"消息已发出，但本地同步失败，稍后会自动补全。"}
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(409, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
                return;
            }
            byte[] body = """
                    {"fetchedCount":1,"insertedCount":1,"ignoredCount":0}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/chat/messages", exchange -> {
            historyPageRequests.incrementAndGet();
            String query = exchange.getRequestURI().getRawQuery();
            lastHistoryQuery.set(query);
            boolean secondPage = query != null && query.contains("page=2");
            boolean latestTarget = query != null && query.contains("keyword=latest");
            boolean mediaResults = query != null && query.contains("keyword=media");
            boolean chainedTarget = query != null && query.contains("keyword=chain");
            if (query != null && query.contains("keyword=slow")) {
                try {
                    Thread.sleep(300);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            sendJson(exchange, """
                    {
                      "group":{"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                        "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                      "items":[%s],"page":%d,"size":50,"total":%d
                    }
                    """.formatted(
                    chainedTarget
                            ? messageJson(91, "小凯", "连续加载目标", 91000)
                            : mediaResults
                            ? historyMediaMessageJson(10, 1, "分享图片", "/chat/media?preview=10", "")
                                    + "," + historyMediaMessageJson(
                                    11, 13, "分享视频", "/chat/media?preview=11", "/chat/media?video=11")
                                    + "," + historyMediaMessageJson(12, 1, "图片地址失效", "", "")
                                    + "," + historyMediaMessageJson(13, 13, "视频地址失效", "", "")
                            : latestTarget
                            ? messageJson(9, "小凯", "最新目标消息", 9000)
                            : secondPage
                            ? messageJson(3, "小凯", "第二页消息", 3000)
                            : messageJson(5, "小凯", "周末一起爬山", 5000) + ","
                                    + messageJson(4, "小凯", "准备登山鞋", 4000),
                    secondPage ? 2 : 1,
                    chainedTarget ? 1 : mediaResults ? 4 : latestTarget ? 1 : 51));
        });
        server.createContext("/chat/media", exchange -> {
            mediaRequests.incrementAndGet();
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
        groupListRequests.set(0);
        latestPageRequests.set(0);
        earlierPageRequests.set(0);
        historyPageRequests.set(0);
        historyBeforeRequests.set(0);
        historyAfterRequests.set(0);
        mediaRequests.set(0);
        lastHistoryQuery.set(null);
        failGroups.set(false);
        failMessages.set(false);
        delayEarlierHistory.set(false);
        failSend.set(false);
        failSendSync.set(false);
        sendRequests.set(0);
        loginInvalid.set(false);
        loginStatusRequests.set(0);
        qrLoginRequests.set(0);
        failQrLogin.set(false);
    }

    @Test
    void loads_real_groups_and_renders_latest_messages_in_chronological_order() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator(".group-row")).hasCount(2);
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"较早消息", "较新消息"});
        assertThat(page.locator("#send-button")).hasCount(0);
        assertThat(page.locator("#composer")).isEnabled();
        assertThat(page.locator("#composer")).hasAttribute("placeholder", "输入消息后按 Enter 发送");
        assertThat(page.locator(".composer-hint"))
                .hasText("按下 Enter 发送内容 / Shift+Enter 换行");
        assertThat(page.locator(".composer button:enabled:not(#history-open):not(#emoji-picker-open)")).hasCount(0);
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
    void opens_empty_history_and_queries_the_current_group_with_filters() {
        Page page = browser.newPage();
        page.addInitScript("""
                const RealDate = Date;
                const fixedNow = RealDate.parse("2026-05-31T12:00:00+08:00");
                window.Date = class extends RealDate {
                  constructor(...args) {
                    super(...(args.length ? args : [fixedNow]));
                  }
                  static now() {
                    return fixedNow;
                  }
                };
                """);
        page.navigate(baseUrl + "/chat/index.html");

        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("聊天记录")).click();

        assertThat(page.locator("#history-dialog")).isVisible();
        assertThat(page.locator("#history-empty")).hasText("设置筛选条件后点击查询");
        org.assertj.core.api.Assertions.assertThat(historyPageRequests.get()).isZero();
        assertThat(page.locator("#history-start")).hasValue("2026-02-28");
        assertThat(page.locator("#history-end")).hasValue("2026-05-31");
        org.assertj.core.api.Assertions.assertThat(page.locator("#history-sender").getAttribute("type"))
                .isEqualTo("search");

        page.locator("#history-start").fill("2026-04-01");
        page.locator("#history-end").fill("2026-07-29");
        page.locator("#history-sender").fill("小凯");
        page.locator("#history-keyword").fill("爬山");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result")).hasCount(2);
        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"周末一起爬山", "准备登山鞋"});
        assertThat(page.locator("#history-page-state")).hasText("第 1 / 3 页，共 51 条");
        assertThat(page.locator(".history-result-summary mark")).hasText("爬山");
        org.assertj.core.api.Assertions.assertThat(lastHistoryQuery.get())
                .contains("gid=101", "start=2026-04-01+00%3A00%3A00",
                        "end=2026-07-29+23%3A59%3A59", "senderName=%E5%B0%8F%E5%87%AF",
                        "keyword=%E7%88%AC%E5%B1%B1", "page=1", "size=20");

        page.locator("#history-next").click();
        assertThat(page.locator(".history-result-summary")).hasText("第二页消息");
        assertThat(page.locator("#history-page-state")).hasText("第 2 / 3 页，共 51 条");
        org.assertj.core.api.Assertions.assertThat(lastHistoryQuery.get())
                .contains("senderName=%E5%B0%8F%E5%87%AF", "keyword=%E7%88%AC%E5%B1%B1", "page=2");

        page.locator("#history-previous").click();
        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"周末一起爬山", "准备登山鞋"});

        page.close();
    }

    @Test
    void loads_earlier_and_newer_history_while_preserving_the_scroll_anchor() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();
        page.locator(".history-result[data-mid='5']").click();
        assertThat(page.locator("#history-messages [data-mid='3']")).isVisible();

        Object targetTopBefore = page.locator("#history-messages").evaluate("""
                element => {
                  element.style.height = "120px";
                  element.scrollTop = 0;
                  const top = element.querySelector("[data-mid='5']").getBoundingClientRect().top;
                  element.dispatchEvent(new Event("scroll"));
                  return top;
                }
                """);

        assertThat(page.locator("#history-messages [data-mid='2']")).isVisible();
        Object targetTopAfter = page.locator("#history-messages [data-mid='5']")
                .evaluate("element => element.getBoundingClientRect().top");
        org.assertj.core.api.Assertions.assertThat(((Number) targetTopAfter).doubleValue())
                .isCloseTo(((Number) targetTopBefore).doubleValue(),
                        org.assertj.core.data.Offset.offset(0.5));
        assertThat(page.locator("#history-earlier-state")).hasText("没有更早消息");

        page.locator("#history-messages").evaluate("""
                element => {
                  element.scrollTop = element.scrollHeight;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#history-messages [data-mid='8']")).isVisible();
        assertThat(page.locator("#history-newer-state")).hasText("没有更新消息");
        org.assertj.core.api.Assertions.assertThat(historyBeforeRequests.get()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(historyAfterRequests.get()).isEqualTo(2);

        page.close();
    }

    @Test
    void one_downward_scroll_loads_only_one_newer_history_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("chain");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();
        page.locator(".history-result[data-mid='91']").click();
        assertThat(page.locator("#history-messages [data-mid='141']")).isVisible();

        Response response = page.waitForResponse(
                item -> item.url().contains("afterCreatedAt=141000"),
                () -> page.locator("#history-messages").evaluate("""
                        element => {
                          element.scrollTop = element.scrollHeight;
                          element.dispatchEvent(new Event("scroll"));
                        }
                        """));
        org.assertj.core.api.Assertions.assertThat(response.ok()).isTrue();
        assertThat(page.locator("#history-messages [data-mid='191']")).isVisible();
        Object oldestNewerOffset = page.locator("#history-messages [data-mid='142']").evaluate("""
                message => {
                  const container = message.parentElement;
                  const paddingTop = Number.parseFloat(getComputedStyle(container).paddingTop);
                  return message.getBoundingClientRect().top
                    - container.getBoundingClientRect().top - paddingTop;
                }
                """);
        org.assertj.core.api.Assertions.assertThat(((Number) oldestNewerOffset).doubleValue())
                .isCloseTo(0, org.assertj.core.data.Offset.offset(0.5));
        page.waitForTimeout(400);

        org.assertj.core.api.Assertions.assertThat(historyAfterRequests.get()).isEqualTo(2);
        assertThat(page.locator("#history-messages [data-mid='192']")).hasCount(0);

        Response nextResponse = page.waitForResponse(
                item -> item.url().contains("afterCreatedAt=191000"),
                () -> page.locator("#history-messages").evaluate("""
                        element => {
                          element.scrollTop = element.scrollHeight;
                          element.dispatchEvent(new Event("scroll"));
                        }
                        """));
        org.assertj.core.api.Assertions.assertThat(nextResponse.ok()).isTrue();
        assertThat(page.locator("#history-messages [data-mid='192']")).isVisible();
        org.assertj.core.api.Assertions.assertThat(historyAfterRequests.get()).isEqualTo(3);
        page.close();
    }

    @Test
    void history_result_rows_do_not_inherit_dialog_control_button_styles() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        Object styles = page.locator(".history-result").first().evaluate("""
                element => {
                  const style = getComputedStyle(element);
                  return [style.borderTopWidth, style.borderRadius, style.backgroundImage];
                }
                """);
        org.assertj.core.api.Assertions.assertThat(styles)
                .isEqualTo(java.util.List.of("0px", "0px", "none"));
        page.close();
    }

    @Test
    void clears_history_content_and_filters_every_time_the_dialog_opens() {
        Page page = browser.newPage();
        page.addInitScript("""
                const RealDate = Date;
                const fixedNow = RealDate.parse("2026-05-31T12:00:00+08:00");
                window.Date = class extends RealDate {
                  constructor(...args) {
                    super(...(args.length ? args : [fixedNow]));
                  }
                  static now() {
                    return fixedNow;
                  }
                };
                """);
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-start").fill("2026-04-01");
        page.locator("#history-end").fill("2026-07-29");
        page.locator("#history-sender").fill("小凯");
        page.locator("#history-keyword").fill("爬山");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();
        page.locator(".history-result[data-mid='5']").click();
        assertThat(page.locator("#history-messages .bubble")).hasCount(5);

        page.locator("#history-close").click();
        page.locator("#history-open").click();
        assertThat(page.locator("#history-empty")).hasText("设置筛选条件后点击查询");
        assertThat(page.locator("#history-results")).isHidden();
        assertThat(page.locator("#history-context")).isHidden();
        assertThat(page.locator("#history-results-list")).isEmpty();
        assertThat(page.locator("#history-messages")).isEmpty();
        assertThat(page.locator("#history-start")).hasValue("2026-02-28");
        assertThat(page.locator("#history-end")).hasValue("2026-05-31");
        assertThat(page.locator("#history-sender")).hasValue("");
        assertThat(page.locator("#history-keyword")).hasValue("");
        org.assertj.core.api.Assertions.assertThat(historyPageRequests.get()).isEqualTo(1);

        page.close();
    }

    @Test
    void centers_a_target_even_when_it_is_the_latest_history_message() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("latest");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();
        page.locator(".history-result[data-mid='9']").click();
        assertThat(page.locator("#history-messages [data-mid='9']")).isVisible();

        Object distanceFromCenter = page.locator("#history-messages").evaluate("""
                element => {
                  const list = element.getBoundingClientRect();
                  const target = element.querySelector("[data-mid='9']").getBoundingClientRect();
                  return Math.abs((list.top + list.height / 2) - (target.top + target.height / 2));
                }
                """);
        org.assertj.core.api.Assertions.assertThat(((Number) distanceFromCenter).doubleValue())
                .isLessThan(2.0);

        page.close();
    }

    @Test
    void shows_media_types_in_search_results_without_loading_media() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("media");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"[图片]", "[视频]", "[图片]", "[视频]"});
        org.assertj.core.api.Assertions.assertThat(mediaRequests.get()).isZero();

        page.close();
    }

    @Test
    void ignores_a_history_response_that_arrives_after_switching_groups() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("slow");

        Response response = page.waitForResponse(
                item -> item.url().contains("/chat/messages?") && item.url().contains("keyword=slow"),
                () -> {
                    page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                            new Page.GetByRoleOptions().setName("查询")).click();
                    page.locator("#history-close").click();
                    page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
                });
        org.assertj.core.api.Assertions.assertThat(response.ok()).isTrue();

        page.locator("#history-open").click();
        assertThat(page.locator("#history-empty")).hasText("设置筛选条件后点击查询");
        assertThat(page.locator("#history-results")).isHidden();
        assertThat(page.locator("#history-keyword")).hasValue("");

        page.close();
    }

    @Test
    void latest_history_query_wins_when_an_earlier_query_is_still_loading() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("slow");

        page.waitForRequest(
                request -> request.url().contains("/chat/messages?") && request.url().contains("keyword=slow"),
                () -> page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                        new Page.GetByRoleOptions().setName("查询")).click());
        page.locator("#history-keyword").fill("latest");
        page.getByRole(com.microsoft.playwright.options.AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result[data-mid='9']")).isVisible();
        assertThat(page.locator(".history-result[data-mid='5']")).hasCount(0);
        org.assertj.core.api.Assertions.assertThat(historyPageRequests.get()).isEqualTo(2);

        page.close();
    }

    @Test
    void sends_a_text_message_and_refreshes_to_show_it() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        org.assertj.core.api.Assertions.assertThat(sendRequests.get()).isZero();

        page.locator("#composer").fill("刚发出的消息");
        Response sendResponse = page.waitForResponse(
                item -> item.url().contains("/chat/messages/send"),
                () -> page.locator("#composer").press("Enter"));
        org.assertj.core.api.Assertions.assertThat(sendResponse.ok()).isTrue();
        org.assertj.core.api.Assertions.assertThat(sendRequests.get()).isEqualTo(1);

        assertThat(page.locator("#composer")).isEmpty();
        assertThat(page.locator("#composer")).isEnabled();
        assertThat(page.locator(".composer-hint"))
                .hasText("按下 Enter 发送内容 / Shift+Enter 换行");
        assertThat(page.locator("#messages [data-mid='9'] .bubble")).hasText("刚发出的消息");

        page.close();
    }

    @Test
    void shows_a_sync_failure_hint_without_losing_the_composed_text() {
        failSendSync.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.locator("#composer").fill("待发送");
        page.locator("#composer").press("Enter");

        assertThat(page.locator(".composer-hint"))
                .containsText("消息已发出，但本地同步失败");
        assertThat(page.locator("#composer")).hasValue("待发送");
        assertThat(page.locator("#composer")).isEnabled();

        page.close();
    }

    @Test
    void refreshes_latest_message_summaries_for_all_groups() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        var linkNowPreview = page.locator("[data-gid='202'] .group-preview");

        assertThat(linkNowPreview).hasText("阿呆：收到");
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(linkNowPreview).hasText("媒体用户：新的群消息");

        page.close();
    }

    @Test
    void automatically_loads_earlier_messages_near_the_top() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 10;
                  element.dispatchEvent(new Event("scroll"));
                  element.dispatchEvent(new Event("scroll"));
                  element.dispatchEvent(new Event("scroll"));
                }
                """);

        assertThat(page.locator(".message .bubble"))
                .hasText(new String[]{"最早消息", "较早消息", "较新消息"});
        org.assertj.core.api.Assertions.assertThat(earlierPageRequests.get()).isEqualTo(1);
        assertThat(page.locator("#load-earlier")).isDisabled();
        assertThat(page.locator("#load-earlier")).isHidden();

        page.close();
    }

    @Test
    void keeps_current_message_in_place_after_loading_earlier_messages() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        Object currentMessageTopBefore = page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "80px";
                  element.scrollTop = 10;
                  const currentMessageTop = element.querySelector("[data-mid='1']")
                    .getBoundingClientRect().top;
                  element.dispatchEvent(new Event("scroll"));
                  return currentMessageTop;
                }
                """);
        assertThat(page.locator("[data-mid='0']")).isVisible();

        Object currentMessageTopAfter = page.locator("[data-mid='1']")
                .evaluate("element => element.getBoundingClientRect().top");
        org.assertj.core.api.Assertions.assertThat(((Number) currentMessageTopAfter).doubleValue())
                .isCloseTo(((Number) currentMessageTopBefore).doubleValue(),
                        org.assertj.core.data.Offset.offset(0.5));

        page.close();
    }

    @Test
    void stays_at_the_bottom_after_media_finishes_loading_on_refresh() {
        Page page = browser.newPage();
        page.setViewportSize(1000, 400);
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.reload();
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        page.waitForFunction("""
                () => document.querySelector("[data-mid='4'] .image-preview img")?.naturalHeight > 0
                """);

        Object distanceFromBottom = page.locator("#messages").evaluate("""
                element => element.scrollHeight - element.scrollTop - element.clientHeight
                """);
        org.assertj.core.api.Assertions.assertThat(((Number) distanceFromBottom).doubleValue())
                .isLessThan(1.0);

        page.close();
    }

    @Test
    void hides_new_messages_button_after_scrolling_to_the_bottom() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                }
                """);
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(page.locator("#new-messages")).isVisible();
        page.locator("#messages").evaluate("""
                element => {
                  element.scrollTop = element.scrollHeight;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);

        assertThat(page.locator("#new-messages")).isHidden();

        page.close();
    }

    @Test
    void new_messages_button_refreshes_again_before_scrolling_to_the_bottom() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                }
                """);
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(page.locator("#new-messages")).isVisible();
        assertThat(page.locator("[data-mid='3']")).isVisible();
        Response response = page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor"),
                new Page.WaitForResponseOptions().setTimeout(1_000),
                () -> page.locator("#new-messages").click());

        org.assertj.core.api.Assertions.assertThat(response.ok()).isTrue();
        assertThat(page.locator("[data-mid='4']")).isVisible();
        assertThat(page.locator("#new-messages")).isHidden();

        page.close();
    }

    @Test
    void polls_local_messages_every_second() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.waitForTimeout(500);
        int requestsAfterLoad = latestPageRequests.get();

        Response response = page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor"),
                new Page.WaitForResponseOptions().setTimeout(3_000),
                () -> {
                });

        org.assertj.core.api.Assertions.assertThat(response.ok()).isTrue();
        org.assertj.core.api.Assertions.assertThat(latestPageRequests.get())
                .isGreaterThan(requestsAfterLoad);

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
    void renders_a_file_message_as_a_download_link() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='10'] .file-download"))
                .hasAttribute("href", "/chat/media?gid=202&mid=10&variant=file");
        assertThat(page.locator("[data-mid='10'] .file-download"))
                .hasAttribute("download", "海外即插即充流程.md");
        assertThat(page.locator("[data-mid='10'] .file-download"))
                .hasText("海外即插即充流程.md");

        page.close();
    }

    @Test
    void renders_a_weibo_share_as_a_card_with_author_summary_and_link() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='11'] .weibo-card-author")).hasText("tombkeeper");
        assertThat(page.locator("[data-mid='11'] .weibo-card-summary"))
                .containsText("如果未来中国也被迫要腾笼换鸟");
        assertThat(page.locator("[data-mid='11'] .weibo-card-link"))
                .hasAttribute("href", "http://weibo.com/1401527553/Rbd0OxIhB");

        page.close();
    }

    @Test
    void renders_a_sticker_as_an_image() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='12'] .image-preview img"))
                .hasAttribute("src", "https://wx4.sinaimg.cn/large/sticker.jpg");

        page.close();
    }

    @Test
    void highlights_admin_messages_with_a_distinct_bubble_color() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='4']")).hasClass(java.util.regex.Pattern.compile("admin-message"));
        assertThat(page.locator("[data-mid='6']")).not().hasClass(java.util.regex.Pattern.compile("admin-message"));

        page.close();
    }

    @Test
    void opens_message_links_in_a_new_tab_without_exposing_the_opener() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("[data-mid='8'] .bubble"))
                .hasText("微博链接 http://weibo.com/1560906700/RaX1Tdqh7");
        assertThat(page.locator("[data-mid='8'] .bubble a"))
                .hasText("http://weibo.com/1560906700/RaX1Tdqh7");
        assertThat(page.locator("[data-mid='8'] .bubble a"))
                .hasAttribute("href", "http://weibo.com/1560906700/RaX1Tdqh7");
        assertThat(page.locator("[data-mid='8'] .bubble a"))
                .hasAttribute("target", "_blank");
        assertThat(page.locator("[data-mid='8'] .bubble a"))
                .hasAttribute("rel", "noopener noreferrer");

        page.close();
    }

    @Test
    void links_group_member_avatars_to_their_weibo_profiles() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        var avatar = page.locator("[data-mid='1'] .message-avatar");

        assertThat(avatar).hasAttribute("href", "https://weibo.com/u/1");
        assertThat(avatar).hasAttribute("aria-label", "查看小凯的微博主页");
        assertThat(avatar).hasAttribute("target", "_blank");
        assertThat(avatar).hasAttribute("rel", "noopener noreferrer");

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

    @Test
    void shows_login_expired_prompt_and_starts_qr_login_on_click() {
        loginInvalid.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#login-expired")).isVisible();
        assertThat(page.locator("#login-qr")).hasText("📱 扫码登录");
        assertThat(page.locator("#login-qr")).isEnabled();

        page.locator("#login-qr").click();
        assertThat(page.locator("#login-qr")).hasText("📱 扫码中…");
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
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("#login-expired")).isVisible();
        page.locator("#login-qr").click();
        assertThat(page.locator("#login-qr")).hasText("📱 扫码登录");
        assertThat(page.locator("#login-qr")).isEnabled();
        assertThat(page.locator("#groups-state")).containsText("扫码登录失败");

        page.close();
    }

    @Test
    void opens_emoji_panel_above_button_and_toggles_closed_on_second_click() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.locator("#emoji-picker-open").click();
        assertThat(page.locator("#emoji-panel")).isVisible();
        Number panelBottom = (Number) page.locator("#emoji-panel").evaluate(
                "el => el.getBoundingClientRect().bottom");
        Number btnTop = (Number) page.locator("#emoji-picker-open").evaluate(
                "el => el.getBoundingClientRect().top");
        org.assertj.core.api.Assertions.assertThat(panelBottom.doubleValue())
                .isLessThanOrEqualTo(btnTop.doubleValue());

        page.locator("#emoji-picker-open").click();
        assertThat(page.locator("#emoji-panel")).isHidden();

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

    private static String cursorMessagesJson(boolean hasMore, Long nextBeforeCreatedAt,
                                             Long nextBeforeMid, String messages) {
        return """
                {
                  "group":{"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                    "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                  "items":[%s],"size":50,"hasMore":%s,
                  "nextBeforeCreatedAt":%s,"nextBeforeMid":%s
                }
                """.formatted(messages, hasMore, nextBeforeCreatedAt, nextBeforeMid);
    }

    private static String afterCursorMessagesJson(boolean hasMore, Long nextAfterCreatedAt,
                                                  Long nextAfterMid, String messages) {
        return """
                {
                  "group":{"gid":101,"name":"周末活动讨论组","avatar":"","memberCount":12,
                    "maxMember":500,"ownerId":1,"admins":[],"summary":"周末出游","groupType":1},
                  "items":[%s],"size":50,"hasMore":%s,
                  "nextAfterCreatedAt":%s,"nextAfterMid":%s
                }
                """.formatted(messages, hasMore, nextAfterCreatedAt, nextAfterMid);
    }

    private static String messageRangeJson(long firstMid, long lastMid) {
        StringBuilder messages = new StringBuilder();
        for (long mid = lastMid; mid >= firstMid; mid--) {
            if (!messages.isEmpty()) {
                messages.append(',');
            }
            messages.append(messageJson(mid, "群友", "消息 " + mid, mid * 1000));
        }
        return messages.toString();
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

    private static String historyMediaMessageJson(long mid, int mediaType, String text,
                                                  String previewUrl, String videoUrl) {
        return """
                {"mid":%d,"gid":101,"msgType":321,"msgTypeName":"普通消息","mediaType":%d,
                 "senderId":1,"senderName":"小凯","senderAvatar":"","text":"%s",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"%s","originalUrl":"","videoUrl":"%s"}
                """.formatted(mid, mediaType, text, mid * 1000, mid * 1000, previewUrl, videoUrl);
    }

    private static String fileMessageJson(long mid, String text, String fileUrl) {
        return """
                {"mid":%d,"gid":202,"msgType":321,"msgTypeName":"普通消息","mediaType":5,
                 "senderId":9,"senderName":"媒体用户","senderAvatar":"","text":"%s",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"","originalUrl":"","videoUrl":"","fileUrl":"%s"}
                """.formatted(mid, text, mid * 1000, mid * 1000, fileUrl);
    }

    private static String weiboMessageJson(long mid, String author, String summary, String link) {
        return """
                {"mid":%d,"gid":202,"msgType":321,"msgTypeName":"普通消息","mediaType":14,
                 "senderId":9,"senderName":"媒体用户","senderAvatar":"","text":"%s",
                 "urlObjects":[{"url_ori":"%s","status":{"text":"%s","user":{"screen_name":"%s"}}}],
                 "picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"","originalUrl":"","videoUrl":"","fileUrl":""}
                """.formatted(mid, link, link, summary, author, mid * 1000, mid * 1000);
    }

    private static String stickerMessageJson(long mid, String stickerUrl) {
        return """
                {"mid":%d,"gid":202,"msgType":321,"msgTypeName":"普通消息","mediaType":15,
                 "senderId":9,"senderName":"媒体用户","senderAvatar":"","text":"[动画表情]",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":%d,"savedAt":%d,
                 "previewUrl":"%s","originalUrl":"%s","videoUrl":"","fileUrl":""}
                """.formatted(mid, mid * 1000, mid * 1000, stickerUrl, stickerUrl);
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
