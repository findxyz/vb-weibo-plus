package xyz.fz.weibo.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Response;
import com.microsoft.playwright.options.AriaRole;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.assertj.core.api.Assertions;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

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
    private static final AtomicBoolean delayGroups = new AtomicBoolean();
    private static final AtomicBoolean failMessages = new AtomicBoolean();
    private static final AtomicBoolean delayEarlierHistory = new AtomicBoolean();
    private static final AtomicBoolean failSend = new AtomicBoolean();
    private static final AtomicBoolean failSendSync = new AtomicBoolean();
    private static final AtomicInteger sendRequests = new AtomicInteger();
    private static final AtomicBoolean delaySend = new AtomicBoolean();
    private static final AtomicBoolean delaySendLong = new AtomicBoolean();
    private static final AtomicReference<String> lastSendGid = new AtomicReference<>();
    private static final AtomicBoolean loginInvalid = new AtomicBoolean();
    private static final AtomicInteger loginStatusRequests = new AtomicInteger();
    private static final AtomicInteger qrLoginRequests = new AtomicInteger();
    private static final AtomicBoolean failQrLogin = new AtomicBoolean();
    private static final AtomicBoolean delayGroup202Latest = new AtomicBoolean();
    private static final AtomicBoolean delayGroup202Preview = new AtomicBoolean();
    private static final AtomicBoolean emptyGroup202 = new AtomicBoolean();
    private static final AtomicBoolean textOnlyGroup202 = new AtomicBoolean();
    private static final AtomicBoolean catchUpMessages = new AtomicBoolean();
    private static final AtomicBoolean multipleCelebrationMessages = new AtomicBoolean();
    private static final AtomicBoolean delayAnalysisDetail = new AtomicBoolean();
    private static final AtomicBoolean dreamEggMessage = new AtomicBoolean();

    @BeforeAll
    static void startBrowserAndServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // 浏览器会并发发出轮询、媒体与发送请求，服务器必须并发处理，
        // 否则任一可控延迟都会阻塞后续全部响应，切群协调场景无法构造
        server.setExecutor(Executors.newFixedThreadPool(4, runnable -> {
            Thread thread = new Thread(runnable);
            thread.setDaemon(true);
            return thread;
        }));
        server.createContext("/chat/groups", exchange -> {
            if (failGroups.get()) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            if (delayGroups.get()) {
                try {
                    Thread.sleep(400);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
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
                if (delayGroup202Latest.getAndSet(false)) {
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                    }
                }
                if (emptyGroup202.get()) {
                    sendJson(exchange, cursorMessagesJson(false, null, null, ""));
                    return;
                }
                if (textOnlyGroup202.get()) {
                    sendJson(exchange, cursorMessagesJson(false, null, null, messageRangeJson(1, 40)));
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
                String messages = "202".equals(lastSendGid.get())
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
            if (query.contains("afterCreatedAt=2000") && query.contains("afterMid=2")
                    && catchUpMessages.getAndSet(false)) {
                sendJson(exchange, afterCursorMessagesJson(false, null, null,
                        messageJson(3, "阿呆", "追平消息", 3000)));
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
            String dreamEgg = !refreshed && dreamEggMessage.getAndSet(false)
                    ? dreamMessageJson(14) + ","
                    : "";
            String newMessage;
            if (refreshed && multipleCelebrationMessages.getAndSet(false)) {
                newMessage = messageJson(4, "小凯", "第二条刷新后消息", 4000) + ","
                        + messageJson(3, "阿呆", "第一条刷新后消息", 3000) + ",";
            } else {
                newMessage = requestNumber > 2
                        ? messageJson(4, "小凯", "点击后消息", 4000) + ","
                                + messageJson(3, "阿呆", "刷新后消息", 3000) + ","
                        : refreshed ? messageJson(3, "阿呆", "刷新后消息", 3000) + "," : "";
            }
            sendJson(exchange, cursorMessagesJson(true,
                    refreshed ? 2_000L : 1_000L, refreshed ? 2L : 1L,
                    dreamEgg
                            + newMessage
                            + messageJson(2, "飞飞", "较新消息", 2000) + ","
                            + messageJson(1, "小凯", "较早消息", 1000)));
        });
        server.createContext("/chat/messages/send", exchange -> {
            sendRequests.incrementAndGet();
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            lastSendGid.set(requestBody.replaceAll(".*(?:^|&)gid=([^&]+).*", "$1"));
            if (delaySendLong.getAndSet(false)) {
                try {
                    Thread.sleep(1_000);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            } else if (delaySend.getAndSet(false)) {
                try {
                    Thread.sleep(300);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
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
        server.createContext("/chat/messages/sendImage", exchange -> {
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
        server.createContext("/chat/analyses", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/chat/analyses")) {
                sendJson(exchange, """
                    {"items":[{"id":1,"date":"2026-09-06","promptPreview":"总结讨论",
                      "messageCount":2,"createdAt":"2026-09-06 12:00:00"}],
                     "page":1,"size":20,"total":1}
                    """);
                return;
            }
            if (delayAnalysisDetail.getAndSet(false)) {
                try {
                    Thread.sleep(300);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            sendJson(exchange, """
                {"id":1,"gid":101,"date":"2026-09-06","prompt":"总结讨论",
                 "messageCount":2,"createdAt":"2026-09-06 12:00:00","result":"# 旧报告"}
                """);
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
            if (query != null && query.contains("mid=4") && query.contains("variant=preview")
                    && delayGroup202Preview.get()) {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
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
        delayGroups.set(false);
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
        delaySend.set(false);
        delaySendLong.set(false);
        lastSendGid.set(null);
        loginInvalid.set(false);
        loginStatusRequests.set(0);
        qrLoginRequests.set(0);
        failQrLogin.set(false);
        delayGroup202Latest.set(false);
        delayGroup202Preview.set(false);
        emptyGroup202.set(false);
        textOnlyGroup202.set(false);
        catchUpMessages.set(false);
        multipleCelebrationMessages.set(false);
        delayAnalysisDetail.set(false);
        dreamEggMessage.set(false);
    }

    @Test
    void loads_chat_modules_after_dom_content_loaded_without_page_errors() {
        Page page = browser.newPage();
        AtomicReference<String> pageError = new AtomicReference<>();
        page.onPageError(pageError::set);
        page.navigate(baseUrl + "/chat/index.html");

        assertThat(page.locator("script[type='module'][src='chat.js']")).hasCount(1);
        Object emojiCount = page.evaluate("() => Object.keys(window.WEIBO_EMOJI_MAP || {}).length");
        Assertions.assertThat(((Number) emojiCount).intValue()).isGreaterThan(0);
        Assertions.assertThat(pageError.get()).isNull();
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        page.close();
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
        assertThat(page.locator(".composer button:enabled:not(#history-open):not(#emoji-picker-open):not(#image-picker-open):not(#video-picker-open):not(#analysis-open):not(#composer-attachment-remove)")).hasCount(0);
        assertThat(page.locator(".message.mine")).hasCount(0);
        assertThat(page.locator(".read-only-badge")).hasCount(0);
        assertThat(page.locator("#refresh-state")).hasCount(0);
        assertThat(page.locator(".composer-tools > span")).hasCount(0);
        assertThat(page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("图片")).locator(".composer-tool-emoji"))
                .hasText("🖼️");
        Object avatarFitsContainer = page.locator(".group-avatar img").first().evaluate("""
                image => image.offsetWidth === image.parentElement.clientWidth
                  && image.offsetHeight === image.parentElement.clientHeight
                """);
        Assertions.assertThat(avatarFitsContainer).isEqualTo(true);

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
    void ignores_analysis_detail_response_after_closing_and_reopening_the_dialog() {
        delayAnalysisDetail.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#analysis-open").click();
        assertThat(page.locator(".analysis-item")).hasCount(1);

        page.locator(".analysis-item").click();
        page.locator("#analysis-close").click();
        page.locator("#analysis-open").click();
        assertThat(page.locator("#analysis-results")).isVisible();
        page.waitForTimeout(450);

        assertThat(page.locator("#analysis-detail")).isHidden();
        assertThat(page.locator("#analysis-results")).isVisible();
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

        page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("聊天记录")).click();

        assertThat(page.locator("#history-dialog")).isVisible();
        assertThat(page.locator("#history-empty")).hasText("设置筛选条件后点击查询");
        Assertions.assertThat(historyPageRequests.get()).isZero();
        assertThat(page.locator("#history-start")).hasValue("2026-02-28");
        assertThat(page.locator("#history-end")).hasValue("2026-05-31");
        Assertions.assertThat(page.locator("#history-sender").getAttribute("type"))
                .isEqualTo("search");

        page.locator("#history-start").fill("2026-04-01");
        page.locator("#history-end").fill("2026-07-29");
        page.locator("#history-sender").fill("小凯");
        page.locator("#history-keyword").fill("爬山");
        page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result")).hasCount(2);
        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"周末一起爬山", "准备登山鞋"});
        assertThat(page.locator("#history-page-state")).hasText("第 1 / 3 页，共 51 条");
        assertThat(page.locator(".history-result-summary mark")).hasText("爬山");
        Assertions.assertThat(lastHistoryQuery.get())
                .contains("gid=101", "start=2026-04-01+00%3A00%3A00",
                        "end=2026-07-29+23%3A59%3A59", "senderName=%E5%B0%8F%E5%87%AF",
                        "keyword=%E7%88%AC%E5%B1%B1", "page=1", "size=20");

        page.locator("#history-next").click();
        assertThat(page.locator(".history-result-summary")).hasText("第二页消息");
        assertThat(page.locator("#history-page-state")).hasText("第 2 / 3 页，共 51 条");
        Assertions.assertThat(lastHistoryQuery.get())
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
        page.getByRole(AriaRole.BUTTON,
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
        Assertions.assertThat(((Number) targetTopAfter).doubleValue())
                .isCloseTo(((Number) targetTopBefore).doubleValue(),
                        Offset.offset(0.5));
        assertThat(page.locator("#history-earlier-state")).hasText("没有更早消息");

        page.locator("#history-messages").evaluate("""
                element => {
                  element.scrollTop = element.scrollHeight;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#history-messages [data-mid='8']")).isVisible();
        assertThat(page.locator("#history-newer-state")).hasText("没有更新消息");
        Assertions.assertThat(historyBeforeRequests.get()).isEqualTo(2);
        Assertions.assertThat(historyAfterRequests.get()).isEqualTo(2);

        page.close();
    }

    @Test
    void one_downward_scroll_loads_only_one_newer_history_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("chain");
        page.getByRole(AriaRole.BUTTON,
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
        Assertions.assertThat(response.ok()).isTrue();
        assertThat(page.locator("#history-messages [data-mid='191']")).isVisible();
        Object oldestNewerOffset = page.locator("#history-messages [data-mid='142']").evaluate("""
                message => {
                  const container = message.parentElement;
                  const paddingTop = Number.parseFloat(getComputedStyle(container).paddingTop);
                  return message.getBoundingClientRect().top
                    - container.getBoundingClientRect().top - paddingTop;
                }
                """);
        Assertions.assertThat(((Number) oldestNewerOffset).doubleValue())
                .isCloseTo(0, Offset.offset(0.5));
        page.waitForTimeout(400);

        Assertions.assertThat(historyAfterRequests.get()).isEqualTo(2);
        assertThat(page.locator("#history-messages [data-mid='192']")).hasCount(0);

        Response nextResponse = page.waitForResponse(
                item -> item.url().contains("afterCreatedAt=191000"),
                () -> page.locator("#history-messages").evaluate("""
                        element => {
                          element.scrollTop = element.scrollHeight;
                          element.dispatchEvent(new Event("scroll"));
                        }
                        """));
        Assertions.assertThat(nextResponse.ok()).isTrue();
        assertThat(page.locator("#history-messages [data-mid='192']")).isVisible();
        Assertions.assertThat(historyAfterRequests.get()).isEqualTo(3);
        page.close();
    }

    @Test
    void history_result_rows_do_not_inherit_dialog_control_button_styles() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        Object styles = page.locator(".history-result").first().evaluate("""
                element => {
                  const style = getComputedStyle(element);
                  return [style.borderTopWidth, style.borderRadius, style.backgroundImage];
                }
                """);
        Assertions.assertThat(styles)
                .isEqualTo(List.of("0px", "0px", "none"));
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
        page.getByRole(AriaRole.BUTTON,
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
        Assertions.assertThat(historyPageRequests.get()).isEqualTo(1);

        page.close();
    }

    @Test
    void centers_a_target_even_when_it_is_the_latest_history_message() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("latest");
        page.getByRole(AriaRole.BUTTON,
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
        Assertions.assertThat(((Number) distanceFromCenter).doubleValue())
                .isLessThan(2.0);

        page.close();
    }

    @Test
    void shows_media_types_in_search_results_without_loading_media() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("media");
        page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"[图片]", "[视频]", "[图片]", "[视频]"});
        Assertions.assertThat(mediaRequests.get()).isZero();

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
                    page.getByRole(AriaRole.BUTTON,
                            new Page.GetByRoleOptions().setName("查询")).click();
                    page.locator("#history-close").click();
                    page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
                });
        Assertions.assertThat(response.ok()).isTrue();

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
                () -> page.getByRole(AriaRole.BUTTON,
                        new Page.GetByRoleOptions().setName("查询")).click());
        page.locator("#history-keyword").fill("latest");
        page.getByRole(AriaRole.BUTTON,
                new Page.GetByRoleOptions().setName("查询")).click();

        assertThat(page.locator(".history-result[data-mid='9']")).isVisible();
        assertThat(page.locator(".history-result[data-mid='5']")).hasCount(0);
        Assertions.assertThat(historyPageRequests.get()).isEqualTo(2);

        page.close();
    }

    @Test
    void sends_a_text_message_and_refreshes_to_show_it() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        Assertions.assertThat(sendRequests.get()).isZero();

        page.locator("#composer").fill("刚发出的消息");
        Response sendResponse = page.waitForResponse(
                item -> item.url().contains("/chat/messages/send"),
                () -> page.locator("#composer").press("Enter"));
        Assertions.assertThat(sendResponse.ok()).isTrue();
        Assertions.assertThat(sendRequests.get()).isEqualTo(1);

        assertThat(page.locator("#composer")).isEmpty();
        assertThat(page.locator("#composer")).isEnabled();
        assertThat(page.locator(".composer-hint"))
                .hasText("按下 Enter 发送内容 / Shift+Enter 换行");
        assertThat(page.locator("#messages [data-mid='9'] .bubble")).hasText("刚发出的消息");

        page.close();
    }

    @Test
    void does_not_refresh_the_new_group_when_an_old_group_send_finishes() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        delaySend.set(true);
        page.locator("#composer").fill("切群前发送");
        page.locator("#composer").press("Enter");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.waitForTimeout(700);
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        assertThat(page.locator("#messages")).not().containsText("刚发出的消息");
        page.close();
    }

    @Test
    void does_not_resume_following_when_an_old_group_send_finishes() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        delaySendLong.set(true);
        page.locator("#composer").fill("切群前发送");
        page.waitForRequest(
                request -> request.url().contains("/chat/messages/send"),
                () -> page.locator("#composer").press("Enter"));
        // 新群用纯文本消息渲染，避免媒体加载的回底行为干扰跟随状态
        textOnlyGroup202.set(true);
        page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());

        // 新群内上翻离开底部，进入暂停跟随；此时旧群发送仍在途
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#follow-indicator")).hasClass(Pattern.compile("paused"));

        page.waitForResponse(item -> item.url().contains("/chat/messages/send"), () -> {});
        assertThat(page.locator("#follow-indicator")).hasClass(Pattern.compile("paused"));
        assertThat(page.locator("#messages")).not().containsText("切群前发送");
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
    void image_picker_button_is_enabled_and_attachment_hidden_after_selecting_a_group() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        assertThat(page.locator("#image-picker-open")).isEnabled();
        assertThat(page.locator("#composer-attachment")).isHidden();
        page.close();
    }

    @Test
    void pastes_an_image_and_sends_it_via_sendImage_endpoint() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        page.evaluate("""
                const composer = document.querySelector('#composer');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(new File(['\\x89PNG\\r\\n'], 'pasted.png', {type: 'image/png'}));
                const pasteEvent = new ClipboardEvent('paste', {
                  clipboardData: dataTransfer,
                  bubbles: true,
                  cancelable: true
                });
                composer.dispatchEvent(pasteEvent);
                """);
        assertThat(page.locator("#composer-attachment")).isVisible();
        String previewSrc = page.locator(".composer-attachment-preview").getAttribute("src");
        Assertions.assertThat(previewSrc).startsWith("blob:");
        assertThat(page.locator(".composer-hint")).hasText("按下 Enter 发送图片");

        Response sendResponse = page.waitForResponse(
                item -> item.url().contains("/chat/messages/sendImage"),
                () -> page.locator("#composer-attachment").press("Enter"));
        Assertions.assertThat(sendResponse.ok()).isTrue();
        Assertions.assertThat(sendRequests.get()).isEqualTo(1);
        assertThat(page.locator("#composer-attachment")).isHidden();
        assertThat(page.locator(".composer-hint"))
                .hasText("按下 Enter 发送内容 / Shift+Enter 换行");

        page.close();
    }

    @Test
    void refreshes_latest_message_summaries_for_all_groups() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        var linkNowPreview = page.locator("[data-gid='202'] .group-preview");

        assertThat(linkNowPreview).hasText("阿呆：收到");
        page.waitForResponse(
                item -> item.url().contains("/chat/groups"),
                () -> page.evaluate("window.dispatchEvent(new Event('focus'))"));

        assertThat(linkNowPreview).hasText("媒体用户：新的群消息");

        page.close();
    }

    @Test
    void groups_refresh_dedupes_requests_while_one_is_in_flight() {
        Page page = browser.newPage();
        delayGroups.set(true);
        page.navigate(baseUrl + "/chat/index.html");
        page.waitForResponse(item -> item.url().contains("/chat/groups"), () -> {});
        int afterInitial = groupListRequests.get();

        page.waitForResponse(
                item -> item.url().contains("/chat/groups"),
                () -> {
                    page.evaluate("window.dispatchEvent(new Event('focus'))");
                    page.evaluate("window.dispatchEvent(new Event('focus'))");
                });

        Assertions.assertThat(groupListRequests.get()).isEqualTo(afterInitial + 1);
        page.close();
    }

    @Test
    void metadata_refresh_keeps_conversation_messages_and_scroll_position() {
        Page page = browser.newPage();
        textOnlyGroup202.set(true);
        page.navigate(baseUrl + "/chat/index.html");
        page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());

        // 上翻离开底部暂停跟随，此时群列表元数据刷新不应重开会话或重置滚动
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        Number scrollTop = (Number) page.locator("#messages").evaluate("element => element.scrollTop");
        page.waitForResponse(
                item -> item.url().contains("/chat/groups"),
                () -> page.evaluate("window.dispatchEvent(new Event('focus'))"));

        assertThat(page.locator("[data-gid='202'] .group-preview")).hasText("媒体用户：新的群消息");
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        assertThat(page.locator("[data-mid='4']")).isVisible();
        Number scrollTopAfter = (Number) page.locator("#messages").evaluate("element => element.scrollTop");
        Assertions.assertThat(scrollTopAfter.doubleValue()).isEqualTo(scrollTop.doubleValue());
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
        Assertions.assertThat(earlierPageRequests.get()).isEqualTo(1);

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
        Assertions.assertThat(((Number) currentMessageTopAfter).doubleValue())
                .isCloseTo(((Number) currentMessageTopBefore).doubleValue(),
                        Offset.offset(0.5));

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
        Assertions.assertThat(((Number) distanceFromBottom).doubleValue())
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
        assertThat(page.locator("[data-mid='2']")).isVisible();

        // 加高垫块让缩容后的容器必定远离底部，两屏消息的真实高度会卡在近底阈值边缘
        page.locator("#messages").evaluate("""
                element => {
                  const spacer = document.createElement("div");
                  spacer.style.height = "200px";
                  element.appendChild(spacer);
                  element.style.height = "40px";
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        page.evaluate("window.dispatchEvent(new Event('focus'))");

        assertThat(page.locator("#new-messages")).isVisible();
        assertThat(page.locator("[data-mid='3']")).isVisible();
        Response response = page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor"),
                new Page.WaitForResponseOptions().setTimeout(1_000),
                () -> page.locator("#new-messages").click());

        Assertions.assertThat(response.ok()).isTrue();
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

        Assertions.assertThat(response.ok()).isTrue();
        Assertions.assertThat(latestPageRequests.get())
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

        assertThat(page.locator("[data-mid='4']")).hasClass(Pattern.compile("admin-message"));
        assertThat(page.locator("[data-mid='6']")).not().hasClass(Pattern.compile("admin-message"));

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
        Assertions.assertThat(viewerIsAFullScreenOverlay).isEqualTo(true);

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
        Assertions.assertThat(imageKeepsPortraitRatio).isEqualTo(true);
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
        Assertions.assertThat(newImageIsHiddenWhileLoading).isEqualTo(true);
        assertThat(page.locator("#image-viewer-state")).hasText("正在加载原图…");
        assertThat(page.locator("#image-viewer img")).isVisible();
        assertThat(page.locator("#image-viewer-state")).isEmpty();
        page.mouse().click(4, 4);

        page.locator("[data-mid='5'] .video-preview").click();
        assertThat(page.locator("[data-mid='5'] video"))
                .hasAttribute("src", "/chat/media?gid=202&mid=5&variant=video");
        Assertions
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
    void keeps_the_group_visible_when_messages_fail_and_recovers_by_polling() {
        failMessages.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");

        // 消息加载失败时群仍可见，且中间无失败提示（不展示 messages-state / retry-messages）
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator("#messages-state")).hasCount(0);
        assertThat(page.locator("#retry-messages")).hasCount(0);

        failMessages.set(false);
        // 每秒轮询自动恢复消息，无需手动重试
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
    void does_not_celebrate_initial_messages_when_switching_groups() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "202": {"9": {"name": "媒体用户", "avatar": "", "interval": 1}}
                }));
                localStorage.setItem("weibo-chat:celebration-seen", JSON.stringify({
                  "202:9": 0
                }));
                """);
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        delayGroup202Latest.set(true);
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        page.evaluate("setTimeout(() => window.dispatchEvent(new Event('focus')), 20)");
        page.waitForTimeout(800);

        assertThat(page.locator("#current-group")).hasText("LinkNow");
        page.waitForTimeout(100);
        Assertions.assertThat(page.locator("#celebration-stage .celebration-member").count()).isEqualTo(0);
        page.close();
    }

    @Test
    void catches_up_messages_after_returning_from_a_hidden_page() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#messages")).not().containsText("追平消息");

        page.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, value: true})");
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
        catchUpMessages.set(true);
        page.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, value: false})");
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");

        assertThat(page.locator("#messages")).containsText("追平消息");
        assertThat(page.locator("#new-messages")).isVisible();
        page.close();
    }

    @Test
    void ignores_a_previous_group_response_after_switching_back() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        delayGroup202Latest.set(true);
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        page.getByText("周末活动讨论组", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        page.waitForTimeout(500);
        assertThat(page.locator("#messages")).not().containsText("分享图片");
        page.close();
    }

    @Test
    void ignores_a_late_media_load_from_the_previous_group() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        delayGroup202Preview.set(true);
        page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());
        page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=101"),
                () -> page.getByText("周末活动讨论组", new Page.GetByTextOptions().setExact(true)).click());

        // 切回旧群后滚离底部；上一群图片仍在慢速加载
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#follow-indicator")).hasClass(Pattern.compile("paused"));

        page.waitForResponse(
                item -> item.url().contains("/chat/media") && item.url().contains("mid=4")
                        && item.url().contains("variant=preview"),
                () -> {});
        page.waitForTimeout(200);
        Object scrollTop = page.locator("#messages").evaluate("element => element.scrollTop");
        Assertions.assertThat(((Number) scrollTop).doubleValue()).isCloseTo(0, Offset.offset(0.5));
        assertThat(page.locator("#follow-indicator")).hasClass(Pattern.compile("paused"));
        assertThat(page.locator("#messages")).not().containsText("分享图片");
        page.close();
    }

    @Test
    void clears_old_messages_before_a_slow_group_switch_response() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#messages")).containsText("较新消息");

        delayGroup202Latest.set(true);
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("#current-group")).hasText("LinkNow");
        Assertions.assertThat(page.locator("#messages").textContent()).doesNotContain("较新消息");
        page.close();
    }

    @Test
    void shows_no_leftover_messages_when_the_new_group_is_empty() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#messages")).containsText("较新消息");

        emptyGroup202.set(true);
        Response response = page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());
        Assertions.assertThat(response.ok()).isTrue();
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        assertThat(page.locator("#messages")).isEmpty();
        page.close();
    }

    @Test
    void keeps_the_new_group_empty_when_its_first_screen_fails() {
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#messages")).containsText("较新消息");

        failMessages.set(true);
        Response failed = page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());
        Assertions.assertThat(failed.status()).isEqualTo(503);
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        Assertions.assertThat(page.locator("#messages").textContent()).doesNotContain("较新消息");

        failMessages.set(false);
        // 轮询自动恢复后只出现新群自己的消息，旧群消息不得回流
        assertThat(page.locator("[data-mid='4'] .image-preview")).isVisible();
        Assertions.assertThat(page.locator("#messages").textContent()).doesNotContain("较新消息");
        page.close();
    }

    @Test
    void cancels_a_celebration_when_switching_groups() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "101": {"3": {"name": "阿呆", "avatar": "", "interval": 1}}
                }));
                localStorage.setItem("weibo-chat:celebration-seen", JSON.stringify({
                  "101:3": 1000
                }));
                """);
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        page.evaluate("window.dispatchEvent(new Event('focus'))");
        assertThat(page.locator(".celebration-member")).isVisible();
        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();

        assertThat(page.locator("#current-group")).hasText("LinkNow");
        page.waitForTimeout(100);
        Assertions.assertThat(page.locator("#celebration-stage .celebration-member").count()).isEqualTo(0);
        page.close();
    }

    @Test
    void refreshes_the_celebration_roster_when_switching_groups() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "101": {"3": {"name": "阿呆", "avatar": "", "interval": 30}}
                }));
                """);
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        // 进入会话后渲染当前群的庆祝名单
        assertThat(page.locator("#celebration-roster .celebration-chip")).hasCount(1);

        page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click();
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        // 切到无名单的群后不得残留上一群的成员
        assertThat(page.locator("#celebration-roster")).isHidden();

        page.getByText("周末活动讨论组", new Page.GetByTextOptions().setExact(true)).click();
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");
        assertThat(page.locator("#celebration-roster .celebration-chip")).hasCount(1);
        page.close();
    }

    @Test
    void establishes_a_baseline_before_celebrating_when_seen_time_is_missing() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "101": {"3": {"name": "阿呆", "avatar": "", "interval": 1}}
                }));
                localStorage.removeItem("weibo-chat:celebration-seen");
                """);
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        page.evaluate("window.dispatchEvent(new Event('focus'))");
        page.waitForTimeout(800);

        Assertions.assertThat(page.locator("#celebration-stage .celebration-member").count()).isEqualTo(0);
        Object seen = page.evaluate("JSON.parse(localStorage.getItem('weibo-chat:celebration-seen'))['101:3']");
        Assertions.assertThat(((Number) seen).longValue()).isEqualTo(3_000L);
        page.close();
    }

    @Test
    void celebrates_each_qualifying_message_in_one_refresh() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "101": {
                    "3": {"name": "阿呆", "avatar": "", "interval": 1},
                    "4": {"name": "小凯", "avatar": "", "interval": 1}
                  }
                }));
                localStorage.setItem("weibo-chat:celebration-seen", JSON.stringify({
                  "101:3": 1000,
                  "101:4": 1000
                }));
                """);
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        multipleCelebrationMessages.set(true);
        page.evaluate("window.dispatchEvent(new Event('focus'))");
        page.waitForTimeout(800);

        Assertions.assertThat(page.locator("#celebration-stage .celebration-member").count())
                .isEqualTo(2);
        Assertions.assertThat(page.locator("#celebration-stage .celebration-monster").count())
                .isEqualTo(2);
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
        Assertions.assertThat(qrLoginRequests.get()).isGreaterThanOrEqualTo(1);

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
    void sends_once_and_refreshes_once_after_qr_login_reinitialization() {
        loginInvalid.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("#login-expired")).isVisible();

        // 扫码成功触发业务重初始化：重新拉群列表并恢复上次选中的群
        page.waitForResponse(item -> item.url().contains("/weibo/login/qr"),
                () -> page.locator("#login-qr").click());
        page.waitForResponse(item -> item.url().contains("/chat/messages/cursor"), () -> {});
        assertThat(page.locator("#login-expired")).isHidden();
        assertThat(page.locator("#current-group")).hasText("周末活动讨论组");

        int cursorRequestsBeforeSend = latestPageRequests.get();
        page.locator("#composer").fill("重初始化后发送");
        page.waitForResponse(item -> item.url().contains("/chat/messages/send"),
                () -> page.locator("#composer").press("Enter"));
        page.waitForResponse(item -> item.url().contains("/chat/messages/cursor"), () -> {});

        Assertions.assertThat(sendRequests.get()).isEqualTo(1);
        // 3 秒轮询器可能在窗口内追加请求，只断言发送驱动的刷新必然到达；
        // 双查询由刷新去重锁结构性排除（见 groups_refresh_dedupes 测试）
        Assertions.assertThat(latestPageRequests.get()).isGreaterThanOrEqualTo(cursorRequestsBeforeSend + 1);
        assertThat(page.locator("#messages")).containsText("点击后消息");
        page.close();
    }

    @Test
    void dream_popup_launches_the_mickey_game_after_hovering_the_easter_egg_avatar() {
        dreamEggMessage.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("[data-mid='14']")).isVisible();

        page.hover("[data-mid='14'] .message-avatar");
        assertThat(page.locator("#dream-popover")).isVisible();
        assertThat(page.locator("#dream-popover")).containsText("是否进入盗梦空间？");

        page.locator("#dream-enter").click();
        assertThat(page.locator("#dream-dialog")).isVisible();
        Assertions.assertThat(page.locator("#dream-frame").getAttribute("src"))
                .contains("/chat/dream/1176117365.html");

        // 焦点应交给 iframe，回车进游戏而不是触发标题栏的关闭按钮
        page.keyboard().press("Enter");
        assertThat(page.locator("#dream-dialog")).isVisible();

        page.locator("#dream-close").click();
        assertThat(page.locator("#dream-dialog")).isHidden();
        // close 事件是排队任务，用带重试的断言等它生效
        assertThat(page.locator("#dream-frame")).hasAttribute("src", "about:blank");
        page.close();
    }

    @Test
    void dream_popup_stays_visible_until_its_close_button_dismisses_it() {
        dreamEggMessage.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("[data-mid='14']")).isVisible();

        page.hover("[data-mid='14'] .message-avatar");
        assertThat(page.locator("#dream-popover")).isVisible();

        // 弹层出现后不再跟随指针移动消失，鼠标移开也能回头点按钮
        page.mouse().move(10, 10);
        page.waitForTimeout(500);
        assertThat(page.locator("#dream-popover")).isVisible();

        page.locator("#dream-popover-close").click();
        assertThat(page.locator("#dream-popover")).isHidden();
        page.close();
    }

    @Test
    void dream_popup_requires_a_full_hover_and_only_reacts_to_the_easter_egg_avatar() {
        dreamEggMessage.set(true);
        Page page = browser.newPage();
        page.navigate(baseUrl + "/chat/index.html");
        assertThat(page.locator("[data-mid='14']")).isVisible();

        page.hover("[data-mid='2'] .message-avatar");
        page.waitForTimeout(3_300);
        assertThat(page.locator("#dream-popover")).isHidden();

        page.hover("[data-mid='14'] .message-avatar");
        page.waitForTimeout(500);
        page.mouse().move(10, 10);
        page.waitForTimeout(3_000);
        assertThat(page.locator("#dream-popover")).isHidden();
        page.close();
    }

    @Test
    void walks_the_full_group_chat_path_from_selection_to_celebration() {
        Page page = browser.newPage();
        page.addInitScript("""
                localStorage.setItem("weibo-chat:celebration-roster", JSON.stringify({
                  "202": {"1": {"name": "测试者", "avatar": "", "interval": 1}}
                }));
                localStorage.setItem("weibo-chat:celebration-seen", JSON.stringify({
                  "202:1": 4000
                }));
                """);
        page.navigate(baseUrl + "/chat/index.html");

        // 群选择与媒体串联：切到 LinkNow，图片、视频与微博卡片正常渲染
        page.waitForResponse(
                item -> item.url().contains("/chat/messages/cursor") && item.url().contains("gid=202"),
                () -> page.getByText("LinkNow", new Page.GetByTextOptions().setExact(true)).click());
        assertThat(page.locator("#current-group")).hasText("LinkNow");
        assertThat(page.locator("[data-mid='4'] .image-preview")).isVisible();
        assertThat(page.locator("[data-mid='5'] .video-preview")).isVisible();
        assertThat(page.locator("[data-mid='11'] .weibo-card-summary"))
                .hasText("如果未来中国也被迫要腾笼换鸟，希望至少能先把还活着的大力推行和鼓吹计划生育的人先用中华民族传统方法处理一下。");

        // 历史检索串联：按关键词查询当前群
        page.locator("#history-open").click();
        page.locator("#history-keyword").fill("爬山");
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("查询")).click();
        assertThat(page.locator(".history-result")).hasCount(2);
        assertThat(page.locator(".history-result-summary"))
                .hasText(new String[]{"周末一起爬山", "准备登山鞋"});
        page.locator("#history-close").click();

        // Analysis 串联：打开分析弹窗可以看到既有报告列表
        page.locator("#analysis-open").click();
        assertThat(page.locator(".analysis-item")).hasCount(1);
        page.locator("#analysis-close").click();

        // Media Send 串联：发送后通过群归属刷新读回，不前端乐观插入
        page.locator("#composer").fill("组合路径消息");
        page.waitForResponse(item -> item.url().contains("/chat/messages/send"),
                () -> page.locator("#composer").press("Enter"));
        page.waitForResponse(item -> item.url().contains("/chat/messages/cursor"), () -> {});
        assertThat(page.locator("#messages")).containsText("刚发出的消息");

        // 消息滚动串联：上翻暂停跟随，回到底部恢复跟随
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "40px";
                  element.scrollTop = 0;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#follow-indicator")).hasClass(Pattern.compile("paused"));
        page.locator("#messages").evaluate("""
                element => {
                  element.style.height = "";
                  element.scrollTop = element.scrollHeight;
                  element.dispatchEvent(new Event("scroll"));
                }
                """);
        assertThat(page.locator("#follow-indicator")).not().hasClass(Pattern.compile("paused"));

        // Return Celebration 串联：新消息命中名单后出现庆祝
        page.evaluate("window.dispatchEvent(new Event('focus'))");
        page.waitForTimeout(800);
        Assertions.assertThat(page.locator("#celebration-stage .celebration-member").count())
                .isEqualTo(1);
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
        Assertions.assertThat(panelBottom.doubleValue())
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
            } else if (resourcePath.endsWith(".png")) {
                exchange.getResponseHeaders().set("Content-Type", "image/png");
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

    private static String dreamMessageJson(long mid) {
        return """
                {"mid":%d,"gid":101,"msgType":321,"msgTypeName":"普通消息","mediaType":0,
                 "senderId":1176117365,"senderName":"小大饼","senderAvatar":"","text":"梦开始的地方",
                 "urlObjects":[],"picInfos":[],"template":"","templateData":{},"recallMids":[],
                 "recallBy":"","createdAt":1500,"savedAt":1500,
                 "previewUrl":"","originalUrl":"","videoUrl":""}
                """.formatted(mid);
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
