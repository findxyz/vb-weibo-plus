package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.model.request.SearchProfileRequest;
import xyz.fz.weibo.model.response.SearchProfileResponse;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * searchProfile 接口：按时间范围检索用户微博。
 */
@Component
public class SearchProfileApi {

    private static final Logger log = LoggerFactory.getLogger(SearchProfileApi.class);

    private static final String SEARCH_PROFILE_URL = "https://weibo.com/ajax/statuses/searchProfile";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public SearchProfileApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public SearchProfileResponse searchProfile(SearchProfileRequest request) {
        // searchProfile 校验 Referer 里的 uid，必须为 https://weibo.com/u/{uid}，
        // 否则对久远日期的微博返回空 list（近期日期偶尔能命中）
        Map<String, String> headers = new LinkedHashMap<>(WeiboConstants.HEADERS_AJAX);
        headers.put(HttpHeaders.REFERER, "https://weibo.com/u/" + request.uid());
        ResponseEntity<String> resp = client.getForString(
                SEARCH_PROFILE_URL, request.toParams(), headers, true);
        try {
            return objectMapper.readValue(resp.getBody(), SearchProfileResponse.class);
        } catch (JsonProcessingException e) {
            log.warn("搜索微博响应非 JSON，按空结果处理：原始响应 = {}，解析错误 = {}", resp.getBody(), e.getMessage());
            return new SearchProfileResponse(
                    new SearchProfileResponse.SearchProfileData(List.of(), 0, ""), 1);
        }
    }
}
