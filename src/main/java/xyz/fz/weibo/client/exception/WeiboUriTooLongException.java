package xyz.fz.weibo.client.exception;

/**
 * URI 过长（414）。
 */
public class WeiboUriTooLongException extends WeiboException {

    public WeiboUriTooLongException(String message) {
        super(message);
    }
}
