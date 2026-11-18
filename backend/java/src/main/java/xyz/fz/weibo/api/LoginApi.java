package xyz.fz.weibo.api;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Cookie;
import com.microsoft.playwright.options.WaitForSelectorState;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.response.LoginResponse;

@Component
public class LoginApi {

    private static final String CHAT_URL = "https://api.weibo.com/chat";

    private final WeiboCookieHolder holder;

    @Value("${weibo.qr-timeout-seconds:300}")
    private int qrTimeoutSeconds;

    private volatile Page currentPage;

    private volatile BrowserContext currentContext;

    public LoginApi(WeiboCookieHolder holder) {
        this.holder = holder;
    }

    @SuppressWarnings({"PMD.UnusedAssignment", "BusyWait"})
    public LoginResponse qrLogin() {
        try (Playwright pw = Playwright.create();
                Browser browser =
                        pw.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true))) {
            BrowserContext ctx = browser.newContext();
            currentContext = ctx;
            Page page = ctx.newPage();
            page.navigate(CHAT_URL);
            currentPage = page;

            long deadline = System.currentTimeMillis() + qrTimeoutSeconds * 1000L;
            while (System.currentTimeMillis() < deadline) {
                Thread.sleep(500);
                List<Cookie> cookies = ctx.cookies();
                String sub = null;
                String subp = null;
                String ssoLoginState = null;
                String alf = null;
                for (Cookie c : cookies) {
                    if (!".weibo.com".equals(c.domain)) {
                        continue;
                    }
                    switch (c.name) {
                        case "SUB" -> sub = c.value;
                        case "SUBP" -> subp = c.value;
                        case "SSOLoginState" -> ssoLoginState = c.value;
                        case "ALF" -> alf = c.value;
                        default -> {}
                    }
                }
                if (sub != null && !sub.isEmpty()) {
                    if (subp == null) {
                        throw new WeiboException("扫码登录不完整，缺少 SUBP");
                    }
                    if (alf == null) {
                        throw new WeiboException("扫码登录不完整，缺少 ALF");
                    }
                    if (ssoLoginState == null) {
                        throw new WeiboException("扫码登录不完整，缺少 SSOLoginState");
                    }
                    currentPage = null;
                    String cookie =
                            "SUBP="
                                    + subp
                                    + "; ALF="
                                    + alf
                                    + "; SSOLoginState="
                                    + ssoLoginState
                                    + "; SUB="
                                    + sub;
                    holder.set(cookie);
                    return new LoginResponse(sub, subp, ssoLoginState, alf);
                }
            }
            throw new WeiboException("扫码登录超时");
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException(
                    "Playwright 浏览器未安装，请先执行：mvn exec:java"
                            + " -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args=\"install"
                            + " chromium\"",
                    e);
        } finally {
            currentContext = null;
            currentPage = null;
        }
    }

    public byte[] captureQrImage() {
        Page page = currentPage;
        if (page == null) {
            return null;
        }
        try {
            for (Cookie c : currentContext.cookies()) {
                if (".weibo.com".equals(c.domain)
                        && "SUB".equals(c.name)
                        && c.value != null
                        && !c.value.isEmpty()) {
                    return null;
                }
            }
        } catch (Exception e) {
            return null;
        }
        try {
            Locator img = page.locator("img");
            img.first()
                    .waitFor(
                            new Locator.WaitForOptions()
                                    .setState(WaitForSelectorState.VISIBLE)
                                    .setTimeout(2000));
            return img.first().screenshot();
        } catch (Exception e) {
            return null;
        }
    }
}
