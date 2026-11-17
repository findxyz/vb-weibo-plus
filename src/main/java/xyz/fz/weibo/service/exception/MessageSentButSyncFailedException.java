package xyz.fz.weibo.service.exception;

public class MessageSentButSyncFailedException extends RuntimeException {

    public MessageSentButSyncFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
