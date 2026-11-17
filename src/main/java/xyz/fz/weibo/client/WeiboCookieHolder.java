package xyz.fz.weibo.client;

import jakarta.annotation.PostConstruct;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

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
            log.atWarn()
                    .addArgument(cookieFile)
                    .addArgument(e::getMessage)
                    .log("读取 cookie 文件 {} 失败，登录态置空：{}");
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
            log.atWarn()
                    .addArgument(cookieFile)
                    .addArgument(e::getMessage)
                    .log("回写 cookie 文件 {} 失败，以内存值为准：{}");
        }
    }
}
