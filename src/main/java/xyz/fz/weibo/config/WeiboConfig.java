package xyz.fz.weibo.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class WeiboConfig {

    /**
     * 关闭重定向，以便 WeiboHttpClient 捕获 302 跳登录域判定 Cookie 失效。
     */
    @Bean
    public CloseableHttpClient httpClient() {
        return HttpClientBuilder.create().disableRedirectHandling().build();
    }

    @Bean
    public RestTemplate restTemplate(CloseableHttpClient httpClient) {
        RestTemplate restTemplate = new RestTemplate(new HttpComponentsClientHttpRequestFactory(httpClient));
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());
        return restTemplate;
    }

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }
}
