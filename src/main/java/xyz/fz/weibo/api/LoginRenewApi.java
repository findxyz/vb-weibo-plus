package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.response.LoginRenewResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 续期链：updatetgt -> crossdomain -> 遍历 arrURL 跨域刷新，回写 .weibo.com 域关键 cookie。
 */
@Component
public class LoginRenewApi {

    private static final Logger log = LoggerFactory.getLogger(LoginRenewApi.class);

    private static final String UPDATETGT_URL = "https://login.sina.com.cn/sso/updatetgt.php";
    private static final String CROSSDOMAIN_URL = "https://login.sina.com.cn/sso/crossdomain.php";

    private final WeiboHttpClient client;
    private final WeiboCookieHolder holder;
    private final ObjectMapper objectMapper;

    public LoginRenewApi(WeiboHttpClient client, WeiboCookieHolder holder, ObjectMapper objectMapper) {
        this.client = client;
        this.holder = holder;
        this.objectMapper = objectMapper;
    }

    public LoginRenewResponse renew() {
        // 第 1 步 updatetgt
        ResponseEntity<String> updatetgtResp = client.getForString(
                UPDATETGT_URL,
                Map.of("entry", "account", "callback", "cb"),
                WeiboConstants.HEADERS_RENEW,
                true);
        String updatetgtBody = updatetgtResp.getBody();
        if (updatetgtBody == null || !updatetgtBody.contains("\"retcode\":0")) {
            throw new WeiboException("续期第 1 步 updatetgt 失败：" + updatetgtBody);
        }
        log.debug("续期第 1 步 updatetgt 成功");

        // 第 2 步 crossdomain
        ResponseEntity<String> crossdomainResp = client.getForString(
                CROSSDOMAIN_URL,
                Map.of("action", "login", "domain", "sina.com.cn", "callback", "cb", "sr", "1920*1080"),
                WeiboConstants.HEADERS_RENEW,
                true);
        String crossdomainBody = crossdomainResp.getBody();
        JsonNode crossdomainNode = parseJsonp(crossdomainBody);
        if (crossdomainNode == null
                || crossdomainNode.get("retcode") == null
                || crossdomainNode.get("retcode").asInt() != 0
                || crossdomainNode.get("arrURL") == null) {
            throw new WeiboException("续期第 2 步 crossdomain 失败：" + crossdomainBody);
        }
        List<String> arrURL = new ArrayList<>();
        for (JsonNode item : crossdomainNode.get("arrURL")) {
            arrURL.add(item.asText());
        }
        log.debug("续期第 2 步 crossdomain 成功，arrURL 数量：{}", arrURL.size());

        // 第 3 步 遍历 arrURL 跨域刷新
        for (String url : arrURL) {
            String fullUrl = url + (url.contains("?") ? "&callback=cb" : "?callback=cb");
            ResponseEntity<String> resp = client.getForString(fullUrl, Map.of(), WeiboConstants.HEADERS_RENEW, true);
            String body = resp.getBody();
            if (url.contains("passport.weibo.com")) {
                List<String> setCookies = resp.getHeaders().getOrEmpty("Set-Cookie");
                holder.mergeRenewal(setCookies);
                log.debug("续期第 3 步 passport.weibo.com 跨域刷新成功，合并 Set-Cookie 数量：{}", setCookies.size());
            } else if (url.contains("passport.weibo.cn")) {
                JsonNode node = parseJsonp(body);
                if (node == null
                        || node.get("retcode") == null
                        || node.get("retcode").asInt() != 20000000) {
                    throw new WeiboException("续期第 3 步跨域刷新失败：" + url + "：" + body);
                }
                log.debug("续期第 3 步 passport.weibo.cn 跨域刷新成功");
            } else {
                throw new WeiboException("续期第 3 步跨域刷新失败：未知 URL：" + url + "：" + body);
            }
        }

        return new LoginRenewResponse(true, "续期成功");
    }

    /**
     * 剥 JSONP 壳：取第一个 `(` 与最后一个 `)` 之间内容。
     * 找不到括号时返回原 body 的解析结果（可能为 null）。
     */
    private JsonNode parseJsonp(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        String json = stripJsonp(body);
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            throw new WeiboException("JSONP 解析失败：" + body, e);
        }
    }

    private String stripJsonp(String body) {
        int start = body.indexOf('(');
        int end = body.lastIndexOf(')');
        if (start < 0 || end < 0 || end <= start) {
            return body;
        }
        return body.substring(start + 1, end);
    }
}
