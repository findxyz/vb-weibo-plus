package xyz.fz.weibo.client;

import java.util.Map;
import org.springframework.http.HttpHeaders;

public final class WeiboConstants {

    private WeiboConstants() {}

    public static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
                    + " Chrome/126.0.0.0 Safari/537.36";

    public static final String REFERER_WEIBO = "https://weibo.com/";

    public static final String X_REQUESTED_WITH = "XMLHttpRequest";

    public static final String SOURCE = "209678993";

    public static final int MAX_RETRY = 3;

    public static final String LOGIN_DOMAIN_REGEX =
            "login\\.sina\\.com\\.cn|passport\\.weibo\\.com|weibo\\.com/login";

    public static final Map<String, String> HEADERS_AJAX =
            Map.of(
                    HttpHeaders.USER_AGENT,
                    USER_AGENT,
                    HttpHeaders.REFERER,
                    REFERER_WEIBO,
                    "X-Requested-With",
                    X_REQUESTED_WITH);

    public static final Map<String, String> HEADERS_WEBIM =
            Map.of(
                    HttpHeaders.USER_AGENT, USER_AGENT,
                    HttpHeaders.REFERER, REFERER_WEIBO);

    public static final Map<String, String> HEADERS_MSGET =
            Map.of(
                    HttpHeaders.USER_AGENT, USER_AGENT,
                    HttpHeaders.REFERER, "https://web.im.weibo.com/",
                    HttpHeaders.ORIGIN, "https://web.im.weibo.com");

    public static final Map<String, String> HEADERS_WEBIM_SEND =
            Map.of(
                    HttpHeaders.USER_AGENT,
                    USER_AGENT,
                    HttpHeaders.REFERER,
                    "https://api.weibo.com/chat");

    public static final Map<String, String> HEADERS_VIDEO_UPLOAD =
            Map.of(
                    HttpHeaders.USER_AGENT, USER_AGENT,
                    HttpHeaders.ORIGIN, "https://api.weibo.com",
                    HttpHeaders.REFERER, "https://api.weibo.com/");

    public static final Map<String, String> HEADERS_DIRECT =
            Map.of(
                    HttpHeaders.USER_AGENT, USER_AGENT,
                    HttpHeaders.REFERER, REFERER_WEIBO);
}
