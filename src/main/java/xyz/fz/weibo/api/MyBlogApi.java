package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.MyBlogRequest;
import xyz.fz.weibo.model.response.MyBlogResponse;

/**
 * 我的微博列表接口。
 */
@Component
public class MyBlogApi {

    private static final String MY_BLOG_URL = "https://weibo.com/ajax/statuses/mymblog";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public MyBlogApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public MyBlogResponse myBlog(MyBlogRequest request) {
        ResponseEntity<String> resp = client.getForString(
                MY_BLOG_URL, request.toParams(), WeiboConstants.HEADERS_AJAX, true);
        try {
            return objectMapper.readValue(resp.getBody(), MyBlogResponse.class);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }
}
