package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.SearchProfileRequest;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SearchProfileApiTest {

    @Mock
    private WeiboHttpClient client;

    @Test
    void html_response_returns_empty_result_instead_of_throwing() {
        SearchProfileApi api = new SearchProfileApi(client, new ObjectMapper());
        SearchProfileRequest request = new SearchProfileRequest(1L, 1, 1281219200L, 1281305599L);
        Map<String, String> headers = new LinkedHashMap<>(WeiboConstants.HEADERS_AJAX);
        headers.put(HttpHeaders.REFERER, "https://weibo.com/u/1");
        when(client.getForString(
                "https://weibo.com/ajax/statuses/searchProfile",
                request.toParams(), headers, true))
                .thenReturn(ResponseEntity.ok("<!DOCTYPE html><html><body>error</body></html>"));

        var response = api.searchProfile(request);

        assertThat(response.ok()).isEqualTo(1);
        assertThat(response.data().list()).isEmpty();
    }
}
