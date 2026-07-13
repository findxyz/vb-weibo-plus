package xyz.fz.weibo.client;

import org.springframework.http.HttpHeaders;

import java.util.Map;

/**
 * 微博接口公共常量与公共 header 组。
 * <p>
 * 四组 header 由 Api 层按接口类型选用，Cookie 由 WeiboHttpClient 按 withCookie 参数追加，不放入 header 组。
 */
public final class WeiboConstants {

    private WeiboConstants() {
    }

    public static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    public static final String REFERER_WEIBO = "https://weibo.com/";

    public static final String X_REQUESTED_WITH = "XMLHttpRequest";

    public static final int MAX_RETRY = 3;

    public static final String LOGIN_DOMAIN_REGEX = "login\\.sina\\.com\\.cn|passport\\.weibo\\.com|weibo\\.com/login";

    /** AJAX 接口：mymblog / longtext / searchProfile */
    public static final Map<String, String> HEADERS_AJAX = Map.of(
            HttpHeaders.USER_AGENT, USER_AGENT,
            HttpHeaders.REFERER, REFERER_WEIBO,
            "X-Requested-With", X_REQUESTED_WITH
    );

    /** webim 接口：group list / group messages。Referer 必须为 weibo.com，否则返回 10012 服务异常。 */
    public static final Map<String, String> HEADERS_WEBIM = Map.of(
            HttpHeaders.USER_AGENT, USER_AGENT,
            HttpHeaders.REFERER, REFERER_WEIBO
    );

    /** 群聊媒体下载：msget */
    public static final Map<String, String> HEADERS_MSGET = Map.of(
            HttpHeaders.USER_AGENT, USER_AGENT,
            HttpHeaders.REFERER, REFERER_WEIBO,
            HttpHeaders.ORIGIN, REFERER_WEIBO
    );

    /** 图床 / 视频直链 */
    public static final Map<String, String> HEADERS_DIRECT = Map.of(
            HttpHeaders.USER_AGENT, USER_AGENT,
            HttpHeaders.REFERER, REFERER_WEIBO
    );
}
