package xyz.fz.weibo.client.exception;

public class WeiboRateLimitException extends WeiboException {

    public WeiboRateLimitException(String message) {
        super(message);
    }

    public WeiboRateLimitException(String message, Throwable cause) {
        super(message, cause);
    }
}
