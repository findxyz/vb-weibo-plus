package xyz.fz.weibo.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class WeiboConfig {

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
    public RestTemplate aiRestTemplate(
            @Value("${weibo.ai.timeout-seconds:120}") int timeoutSeconds) {
        ConnectionConfig connectionConfig = ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofSeconds(10))
                .build();
        PoolingHttpClientConnectionManager connectionManager = new PoolingHttpClientConnectionManager();
        connectionManager.setDefaultConnectionConfig(connectionConfig);
        RequestConfig requestConfig = RequestConfig.custom()
                .setResponseTimeout(Timeout.ofSeconds(timeoutSeconds))
                .build();
        CloseableHttpClient httpClient = HttpClientBuilder.create()
                .setConnectionManager(connectionManager)
                .setDefaultRequestConfig(requestConfig)
                .build();
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
