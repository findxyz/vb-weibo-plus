package xyz.fz.weibo.client.exception;

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
