package xyz.fz.weibo.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.client.exception.WeiboUriTooLongException;

import java.util.Map;

/**
 * 微博接口全局异常处理，按异常类型映射到对应 HTTP 状态码。
 */
@RestControllerAdvice
public class WeiboExceptionHandler {

    @ExceptionHandler(WeiboCookieExpiredException.class)
    public ResponseEntity<Map<String, Object>> handleCookieExpired(WeiboCookieExpiredException e) {
        return build(HttpStatus.UNAUTHORIZED, e.getMessage());
    }

    @ExceptionHandler(WeiboRateLimitException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimit(WeiboRateLimitException e) {
        return build(HttpStatus.TOO_MANY_REQUESTS, e.getMessage());
    }

    @ExceptionHandler(WeiboUriTooLongException.class)
    public ResponseEntity<Map<String, Object>> handleUriTooLong(WeiboUriTooLongException e) {
        return build(HttpStatus.URI_TOO_LONG, e.getMessage());
    }

    @ExceptionHandler(WeiboException.class)
    public ResponseEntity<Map<String, Object>> handleWeibo(WeiboException e) {
        HttpStatus status = e.getErrorCode() != 0 ? HttpStatus.BAD_GATEWAY : HttpStatus.INTERNAL_SERVER_ERROR;
        return build(status, e.getMessage());
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String msg) {
        return ResponseEntity.status(status).body(Map.of("code", status.value(), "msg", msg == null ? "" : msg));
    }
}
