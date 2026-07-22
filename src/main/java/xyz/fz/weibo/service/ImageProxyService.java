package xyz.fz.weibo.service;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;

@Service
public class ImageProxyService {

    private static final String CURL_USER_AGENT = "curl/8.14.1";

    private final RestTemplate restTemplate;

    public ImageProxyService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public MediaBinary fetch(String url) {
        URI target = parseTarget(url);
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.USER_AGENT, CURL_USER_AGENT);
        headers.setAccept(List.of(MediaType.ALL));

        ResponseEntity<byte[]> response;
        try {
            response = restTemplate.exchange(
                    target, HttpMethod.GET, new HttpEntity<Void>(headers), byte[].class);
        } catch (RestClientException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "图片获取失败。", e);
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "图片获取失败，上游状态码：" + response.getStatusCode().value() + "。");
        }

        byte[] content = response.getBody() == null ? new byte[0] : response.getBody();
        MediaType contentType = response.getHeaders().getContentType();
        return new MediaBinary(content, contentType == null
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : contentType.toString());
    }

    private URI parseTarget(String url) {
        if (url == null || url.isBlank()) {
            throw new InvalidRequestException("图片 URL 不能为空。");
        }

        URI target;
        try {
            target = new URI(url);
        } catch (URISyntaxException e) {
            throw new InvalidRequestException("图片 URL 格式不正确。");
        }

        String scheme = target.getScheme();
        if (scheme == null
                || !(scheme.toLowerCase(Locale.ROOT).equals("http")
                || scheme.toLowerCase(Locale.ROOT).equals("https"))) {
            throw new InvalidRequestException("图片 URL 仅支持 HTTP 或 HTTPS。");
        }
        if (target.getHost() == null || target.getUserInfo() != null) {
            throw new InvalidRequestException("图片 URL 格式不正确。");
        }
        assertPublicTarget(target.getHost());
        return target;
    }

    private void assertPublicTarget(String host) {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new InvalidRequestException("图片地址无法解析。");
        }

        for (InetAddress address : addresses) {
            if (address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress()
                    || address.isMulticastAddress()
                    || isUniqueLocalIpv6(address)) {
                throw new InvalidRequestException("图片 URL 不允许指向本机或内网地址。");
            }
        }
    }

    private boolean isUniqueLocalIpv6(InetAddress address) {
        return address instanceof Inet6Address
                && (address.getAddress()[0] & 0xfe) == 0xfc;
    }
}
