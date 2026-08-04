package xyz.fz.weibo.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImageProxyServiceTest {

    private final RestTemplate restTemplate = mock(RestTemplate.class);
    private final ImageProxyService imageProxyService = new ImageProxyService(restTemplate);

    @Test
    void fetches_image_with_curl_request_headers() {
        URI uri = URI.create("https://93.184.216.34/avatar.jpg");
        when(restTemplate.exchange(
                eq(uri), eq(HttpMethod.GET), ArgumentMatchers.<HttpEntity<Void>>any(), eq(byte[].class)))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .body(new byte[]{1, 2, 3}));

        MediaBinary result = imageProxyService.fetch(uri.toString());

        assertThat(result.content()).containsExactly(1, 2, 3);
        assertThat(result.contentType()).isEqualTo("image/jpeg");

        ArgumentCaptor<HttpEntity<Void>> requestCaptor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).exchange(eq(uri), eq(HttpMethod.GET), requestCaptor.capture(), eq(byte[].class));
        HttpHeaders headers = requestCaptor.getValue().getHeaders();
        assertThat(headers.getFirst(HttpHeaders.USER_AGENT)).startsWith("curl/");
        assertThat(headers.getFirst(HttpHeaders.ACCEPT)).isEqualTo("*/*");
        assertThat(headers.containsKey(HttpHeaders.REFERER)).isFalse();
        assertThat(headers.containsKey(HttpHeaders.COOKIE)).isFalse();
    }

    @Test
    void rejects_non_http_urls() {
        assertThatThrownBy(() -> imageProxyService.fetch("file:///etc/passwd"))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejects_private_targets() {
        assertThatThrownBy(() -> imageProxyService.fetch("http://127.0.0.1/avatar.jpg"))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejects_unsuccessful_upstream_response() {
        URI uri = URI.create("https://93.184.216.34/avatar.jpg");
        when(restTemplate.exchange(
                eq(uri), eq(HttpMethod.GET), ArgumentMatchers.<HttpEntity<Void>>any(), eq(byte[].class)))
                .thenReturn(ResponseEntity.status(403).body(new byte[0]));

        assertThatThrownBy(() -> imageProxyService.fetch(uri.toString()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode")
                .isEqualTo(HttpStatus.BAD_GATEWAY);
    }
}
