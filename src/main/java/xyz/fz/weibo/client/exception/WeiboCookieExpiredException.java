package xyz.fz.weibo.client.exception;

/**
 * Cookie 失效：21301/relogin 或 302 跳登录域。映射 HTTP 401。
 */
public class WeiboCookieExpiredException extends WeiboException {

    public WeiboCookieExpiredException(String message) {
        super(message);
    }

    public WeiboCookieExpiredException(String message, Throwable cause) {
        super(message, cause);
    }
}
