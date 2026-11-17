package xyz.fz.weibo.config;

import java.net.URI;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.ResponseErrorHandler;

public class NoOpResponseErrorHandler implements ResponseErrorHandler {

    @Override
    public boolean hasError(ClientHttpResponse response) {
        return false;
    }

    @Override
    public void handleError(URI url, HttpMethod method, ClientHttpResponse response) {}
}
