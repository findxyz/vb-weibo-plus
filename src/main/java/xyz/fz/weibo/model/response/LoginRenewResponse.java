package xyz.fz.weibo.model.response;

/**
 * 续期响应。
 */
public record LoginRenewResponse(
        boolean success,
        String message
) {
}
