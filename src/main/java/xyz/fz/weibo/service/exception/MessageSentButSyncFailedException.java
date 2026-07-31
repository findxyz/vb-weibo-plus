package xyz.fz.weibo.service.exception;

/**
 * 消息已成功发送到微博，但随后的本地增量同步失败。
 * <p>
 * 消息真实存在，本地稍后会被后台同步或下次轮询补全。
 */
public class MessageSentButSyncFailedException extends RuntimeException {

    public MessageSentButSyncFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
