package xyz.fz.weibo.api;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Cookie;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.response.LoginResponse;

import java.util.List;

/**
 * 扫码登录：Playwright 有头 Chromium 打开 chat 页，轮询 SUB cookie 直到用户扫码确认。
 */
@Component
public class LoginApi {

    private static final String CHAT_URL = "https://api.weibo.com/chat";

    private final WeiboCookieHolder holder;

    @Value("${weibo.qr-timeout-seconds:300}")
    private int qrTimeoutSeconds;

    public LoginApi(WeiboCookieHolder holder) {
        this.holder = holder;
    }

    public LoginResponse qrLogin() {
        try (Playwright pw = Playwright.create();
             Browser browser = pw.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false))) {
            BrowserContext ctx = browser.newContext();
            Page page = ctx.newPage();
            page.navigate(CHAT_URL);

            long deadline = System.currentTimeMillis() + qrTimeoutSeconds * 1000L;
            while (System.currentTimeMillis() < deadline) {
                //noinspection BusyWait
                Thread.sleep(2000);
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
                    String cookie = "SUBP=" + subp + "; ALF=" + alf + "; SSOLoginState=" + ssoLoginState + "; SUB=" + sub;
                    holder.set(cookie);
                    return new LoginResponse(sub, subp, ssoLoginState, alf);
                }
            }
            throw new WeiboException("扫码登录超时");
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException("Playwright 浏览器未安装，请先执行：mvn exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args=\"install chromium\"", e);
        }
    }
}
