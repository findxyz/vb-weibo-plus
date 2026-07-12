package xyz.fz.weibo.config;

import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.ResponseErrorHandler;

import java.net.URI;

/**
 * 禁用 RestTemplate 默认的 4xx/5xx 抛异常行为，交给 WeiboHttpClient 统一按状态码判定公共错误。
 */
public class NoOpResponseErrorHandler implements ResponseErrorHandler {

    @Override
    public boolean hasError(ClientHttpResponse response) {
        return false;
    }

    @Override
    public void handleError(URI url, HttpMethod method, ClientHttpResponse response) {
    }
}
