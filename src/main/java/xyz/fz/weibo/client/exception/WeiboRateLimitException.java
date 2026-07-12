package xyz.fz.weibo.client.exception;

/**
 * 限流重试耗尽（429）。
 */
public class WeiboRateLimitException extends WeiboException {

    public WeiboRateLimitException(String message) {
        super(message);
    }
}
