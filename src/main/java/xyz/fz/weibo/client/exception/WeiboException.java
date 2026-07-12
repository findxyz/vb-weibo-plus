package xyz.fz.weibo.client.exception;

/**
 * 微博异常基类，带 errorCode 字段（默认 0，表示非业务错误）。
 */
public class WeiboException extends RuntimeException {

    private final int errorCode;

    public WeiboException(String message) {
        super(message);
        this.errorCode = 0;
    }

    public WeiboException(String message, int errorCode) {
        super(message);
        this.errorCode = errorCode;
    }

    public WeiboException(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = 0;
    }

    public WeiboException(String message, int errorCode, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public int getErrorCode() {
        return errorCode;
    }
}
