package xyz.fz.weibo.client;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cookie 内存缓存与持久化。
 * <p>
 * 应用启动时从 cookie 文件恢复登录态，运行时由 LoginApi 续期链回写。
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

    /**
     * 续期链合并 Set-Cookie。
     * <p>
     * 仅接受 domain 为 .weibo.com 且 name 为 SSOLoginState 的条目，
     * 更新 SSOLoginState 时同步将 ALF 设为相同值，Set-Cookie 中的 ALF 忽略。
     * 合并到当前 cookie 串并按 SUBP; ALF; SSOLoginState; SUB 顺序回写，保留原有 SUB/SUBP 不变。
     */
    public void mergeRenewal(List<String> setCookies) {
        if (setCookies == null || setCookies.isEmpty()) {
            return;
        }
        Map<String, String> map = parseCookie(cookie);
        for (String setCookie : setCookies) {
            if (setCookie == null || setCookie.isEmpty()) {
                continue;
            }
            String domain = null;
            String nameValue = null;
            for (String part : setCookie.split(";")) {
                String trimmed = part.trim();
                if (trimmed.toLowerCase().startsWith("domain=")) {
                    domain = trimmed.substring("domain=".length()).trim();
                } else if (nameValue == null && trimmed.contains("=")) {
                    nameValue = trimmed;
                }
            }
            if (domain == null || !domain.equalsIgnoreCase(".weibo.com")) {
                log.info("mergeRenewal 跳过非 .weibo.com 域 cookie：{}", setCookie);
                continue;
            }
            if (nameValue == null) {
                continue;
            }
            int eq = nameValue.indexOf('=');
            String name = nameValue.substring(0, eq);
            String value = nameValue.substring(eq + 1);
            if ("SSOLoginState".equals(name)) {
                map.put("SSOLoginState", value);
                map.put("ALF", value);
                log.info("mergeRenewal 更新 SSOLoginState={}，ALF 同步为相同值", value);
            } else {
                log.info("mergeRenewal 跳过非 SSOLoginState 的 .weibo.com 域 cookie：{}", setCookie);
            }
        }
        String newCookie = buildCookie(map);
        set(newCookie);
    }

    private Map<String, String> parseCookie(String cookie) {
        Map<String, String> map = new LinkedHashMap<>();
        if (cookie == null || cookie.isEmpty()) {
            return map;
        }
        for (String part : cookie.split(";")) {
            String trimmed = part.trim();
            if (!trimmed.contains("=")) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            map.put(trimmed.substring(0, eq), trimmed.substring(eq + 1));
        }
        return map;
    }

    private String buildCookie(Map<String, String> map) {
        StringBuilder sb = new StringBuilder();
        appendCookie(sb, map, "SUBP");
        appendCookie(sb, map, "ALF");
        appendCookie(sb, map, "SSOLoginState");
        appendCookie(sb, map, "SUB");
        return !sb.isEmpty() ? sb.toString() : "";
    }

    private void appendCookie(StringBuilder sb, Map<String, String> map, String name) {
        String value = map.get(name);
        if (value == null || value.isEmpty()) {
            return;
        }
        if (!sb.isEmpty()) {
            sb.append("; ");
        }
        sb.append(name).append("=").append(value);
    }
}
