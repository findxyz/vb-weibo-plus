package xyz.fz.weibo.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import xyz.fz.weibo.config.SecurityHeadersFilter;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityHeadersFilterTest {

    private final SecurityHeadersFilter filter = new SecurityHeadersFilter();

    private String header(String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getHeader("Content-Security-Policy");
    }

    @Test
    void shell_pages_carry_csp() throws Exception {
        for (String path : new String[]{"/chat", "/chat/", "/chat/index.html",
            "/post", "/post/", "/post/index.html"}) {
            assertThat(header(path)).as("CSP on %s", path)
                .contains("script-src 'self'").contains("base-uri 'none'");
        }
    }

    @Test
    void dream_page_and_api_are_exempt() throws Exception {
        // 游戏页含 inline script，严格 script-src 会废掉它；API 与图片代理无需 CSP
        for (String path : new String[]{"/chat/dream/1176117365.html",
            "/chat/groups", "/chat/image", "/post/list", "/", "/favicon.ico"}) {
            assertThat(header(path)).as("no CSP on %s", path).isNull();
        }
    }
}
