package xyz.fz.weibo.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.Cookie;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import xyz.fz.weibo.client.WeiboCookieHolder;

class LoginApiTest {

    private final LoginApi loginApi = new LoginApi(mock(WeiboCookieHolder.class));

    private static Cookie weiboCookie(String name, String value) {
        Cookie cookie = new Cookie(name, value);
        cookie.domain = ".weibo.com";
        return cookie;
    }

    private void startLogin(Page page, List<Cookie> cookies) {
        BrowserContext context = mock(BrowserContext.class);
        when(context.cookies()).thenReturn(cookies);
        ReflectionTestUtils.setField(loginApi, "currentPage", page);
        ReflectionTestUtils.setField(loginApi, "currentContext", context);
    }

    private static Locator imageLocator(Page page, boolean visible) {
        Locator locator = mock(Locator.class);
        when(locator.first()).thenReturn(locator);
        when(page.locator("img")).thenReturn(locator);
        if (!visible) {
            doThrow(new RuntimeException("二维码轮换中元素短暂失效")).when(locator).waitFor(any());
        }
        return locator;
    }

    @Test
    void capture_returns_null_when_sub_cookie_already_present() {
        startLogin(mock(Page.class), List.of(weiboCookie("SUB", "sub-token-value")));

        assertThat(loginApi.captureQrImage()).isNull();
    }

    @Test
    void capture_returns_null_when_login_not_started() {
        assertThat(loginApi.captureQrImage()).isNull();
    }

    @Test
    void capture_returns_null_when_qr_element_transiently_unavailable() {
        Page page = mock(Page.class);
        startLogin(page, List.of());
        imageLocator(page, false);

        assertThat(loginApi.captureQrImage()).isNull();
    }

    @Test
    void capture_screenshots_first_image_when_scanning_in_progress() {
        Page page = mock(Page.class);
        startLogin(page, List.of());
        Locator locator = imageLocator(page, true);
        byte[] expected = new byte[] {1, 2, 3};
        when(locator.screenshot()).thenReturn(expected);

        assertThat(loginApi.captureQrImage()).isEqualTo(expected);
        verify(locator).screenshot();
    }

    @Test
    void capture_ignores_non_sub_cookies_and_screenshots() {
        Page page = mock(Page.class);
        startLogin(page, List.of(weiboCookie("SSOLoginState", "t")));
        Locator locator = imageLocator(page, true);
        byte[] expected = new byte[] {9, 8, 7};
        when(locator.screenshot()).thenReturn(expected);

        assertThat(loginApi.captureQrImage()).isEqualTo(expected);
        verify(locator).screenshot();
    }
}
