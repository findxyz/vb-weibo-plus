package xyz.fz.weibo.service.exception;

public class MediaProcessingException extends RuntimeException {

    public MediaProcessingException(String message) {
        super(message);
    }

    public MediaProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}
