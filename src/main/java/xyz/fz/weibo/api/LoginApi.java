package xyz.fz.weibo.api;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Cookie;
import com.microsoft.playwright.options.WaitForSelectorState;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.response.LoginResponse;

import java.util.List;

/**
 * 扫码登录：Playwright headless Chromium 打开 chat 页，轮询 SUB cookie 直到用户扫码确认。
 * 登录期间浏览器 Page 暴露为实例字段，供取图端点截图二维码。
 */
@Component
public class LoginApi {

    private static final String CHAT_URL = "https://api.weibo.com/chat";

    private final WeiboCookieHolder holder;

    @Value("${weibo.qr-timeout-seconds:300}")
    private int qrTimeoutSeconds;

    // 登录运行期间持有的页面引用，供取图端点访问。单用户本地工具下无需并发保护。
    private volatile Page currentPage;

    // 登录运行期间持有的浏览器上下文，供取图端点判断登录是否已完成。单用户本地工具下无需并发保护。
    private volatile BrowserContext currentContext;

    public LoginApi(WeiboCookieHolder holder) {
        this.holder = holder;
    }

    public LoginResponse qrLogin() {
        try (Playwright pw = Playwright.create();
             Browser browser = pw.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true))) {
            BrowserContext ctx = browser.newContext();
            currentContext = ctx;
            Page page = ctx.newPage();
            page.navigate(CHAT_URL);
            currentPage = page;

            long deadline = System.currentTimeMillis() + qrTimeoutSeconds * 1000L;
            while (System.currentTimeMillis() < deadline) {
                //noinspection BusyWait
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
                    // 登录已成：立即切断取图，避免登录成功后页面跳转、截图端截到非二维码图片
                    currentPage = null;
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
        } finally {
            currentContext = null;
            currentPage = null;
        }
    }

    /**
     * 截取当前登录页面的二维码图片。
     *
     * @return PNG 图片字节；若登录未进行中、登录已完成或二维码暂不可用（轮换中），返回 null
     */
    public byte[] captureQrImage() {
        Page page = currentPage;
        if (page == null) {
            return null;
        }
        // 登录确认后页面会立即跳转，第一个 img 变成头像不再是二维码；
        // 一旦读到 SUB cookie 即视为登录已成，不再截图，避免前端展示误图
        try {
            for (Cookie c : currentContext.cookies()) {
                if (".weibo.com".equals(c.domain) && "SUB".equals(c.name) && c.value != null && !c.value.isEmpty()) {
                    return null;
                }
            }
        } catch (Exception e) {
            // 上下文已关闭等异常，等同于登录结束，返回 null 让前端保持旧图
            return null;
        }
        try {
            Locator img = page.locator("img");
            img.first().waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.VISIBLE).setTimeout(2000));
            return img.first().screenshot();
        } catch (Exception e) {
            // 二维码轮换中元素短暂失效，返回 null 让前端保持旧图
            return null;
        }
    }
}
