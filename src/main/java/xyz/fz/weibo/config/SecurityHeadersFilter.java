package xyz.fz.weibo.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * 给两个前端 app shell 的 HTML 响应加 Content-Security-Policy。
 * post 页会把微博富文本塞进 innerHTML，是最需要 CSP 兜底的场景。
 *
 * <p>范围刻意收窄：API 与 /chat/image 代理返回 JSON/图片，无需 CSP；
 * /chat/dream/** 的游戏页（静态 HTML）内含 inline script，严格 script-src
 * 会废掉它，明确排除。策略要点：
 * style-src 带 'unsafe-inline'——popover 定位、虚拟列表 spacer 高度都走 element.style；
 * img-src 放开 https:——博主头像与微博表情直链外部 CDN。
 */
@Component
@Order(100)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    static final String CSP = "default-src 'self'; "
        + "script-src 'self'; "
        + "style-src 'self' 'unsafe-inline'; "
        + "img-src 'self' data: https:; "
        + "media-src 'self' https:; "
        + "connect-src 'self'; "
        + "frame-src 'self'; "
        + "font-src 'self' data:; "
        + "object-src 'none'; "
        + "base-uri 'none'; "
        + "form-action 'self'";

    private static final Set<String> SHELL_PATHS = Set.of(
        "/chat", "/chat/", "/chat/index.html",
        "/post", "/post/", "/post/index.html");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !SHELL_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("Content-Security-Policy", CSP);
        filterChain.doFilter(request, response);
    }
}
