package xyz.fz.weibo.client.exception;

public class WeiboCookieExpiredException extends WeiboException {

    public WeiboCookieExpiredException(String message) {
        super(message);
    }

    public WeiboCookieExpiredException(String message, Throwable cause) {
        super(message, cause);
    }
}
