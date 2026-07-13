package xyz.fz.weibo.client;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Cookie 内存缓存与持久化。
 * <p>
 * 应用启动时从 cookie 文件恢复登录态，运行时由 LoginApi 扫码登录回写。
 * 文件写失败只记 warn 日志，以内存值为准。
 */
@Component
public class WeiboCookieHolder {

    private static final Logger log = LoggerFactory.getLogger(WeiboCookieHolder.class);

    @Value("${weibo.cookie-file:.weibo_cookie.txt}")
    private String cookieFile;

    private volatile String cookie;

    @PostConstruct
    void init() {
        try {
            Path path = Path.of(cookieFile);
            if (Files.exists(path)) {
                String data = Files.readString(path).replace("\n", "").replace("\r", "");
                cookie = data.trim();
                if (cookie != null && !cookie.isEmpty()) {
                    log.info("已从 {} 恢复登录态", cookieFile);
                }
            } else {
                cookie = null;
            }
        } catch (Exception e) {
            log.warn("读取 cookie 文件 {} 失败，登录态置空：{}", cookieFile, e.getMessage());
            cookie = null;
        }
    }

    public String get() {
        return cookie;
    }

    public void set(String cookie) {
        this.cookie = cookie;
        try {
            Files.writeString(Path.of(cookieFile), cookie == null ? "" : cookie);
        } catch (Exception e) {
            log.warn("回写 cookie 文件 {} 失败，以内存值为准：{}", cookieFile, e.getMessage());
        }
    }
}
