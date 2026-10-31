package xyz.fz.weibo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestTemplate;
import xyz.fz.weibo.api.PostLikeApi;
import xyz.fz.weibo.client.WeiboCookieHolder;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.config.NoOpResponseErrorHandler;
import xyz.fz.weibo.entity.PostEntity;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.mapper.PostMapper;

import java.util.Optional;
import java.net.SocketTimeoutException;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PostLikeIntegrationTest {

    private MockRestServiceServer upstream;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper();
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());
        upstream = MockRestServiceServer.bindTo(restTemplate).build();
        WeiboCookieHolder credential = mock(WeiboCookieHolder.class);
        when(credential.get()).thenReturn("SUB=test-credential; SUBP=test-profile");
        WeiboHttpClient client = new WeiboHttpClient(restTemplate, credential, mapper);
        PostRepository posts = mock(PostRepository.class);
        when(posts.findById("local-repost")).thenReturn(Optional.of(new PostEntity(
                "local-repost", 5316949752945053L, 1, "captured", "", "", "", "[]",
                "", "", "", 0, 0, 99, 100, 200)));
        PostService service = new PostService(null, null, null, null, new PostMapper(mapper),
                null, posts, new PostLikeApi(client, credential, mapper));
        mvc = MockMvcBuilders.standaloneSetup(new PostController(service))
                .setControllerAdvice(new WeiboExceptionHandler()).build();
    }

    @Test
    void queries_current_account_like_and_count_through_local_post_identifier() throws Exception {
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/show?id=5316949752945053&locale=zh-CN"))
                .andRespond(withSuccess("""
                        {"ok":1,"idstr":"5316949752945053","attitudes_status":1,"attitudes_count":7}
                        """, MediaType.APPLICATION_JSON));

        mvc.perform(get("/post/like").param("mblogId", "local-repost"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.count").value(7));
        upstream.verify();
    }

    @Test
    void likes_outer_post_using_matching_xsrf_cookie_and_returns_confirmed_remote_state() throws Exception {
        expectWrite("setLike", 1, 8);

        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.count").value(8));
        upstream.verify();
    }

    @Test
    void cancels_like_and_returns_current_count_instead_of_captured_count() throws Exception {
        expectWrite("cancelLike", 0, 6);
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.count").value(6));
        upstream.verify();
    }

    @Test
    void rejects_unknown_local_post_and_missing_or_invalid_target_without_calling_weibo() throws Exception {
        mvc.perform(get("/post/like").param("mblogId", "missing"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/post/like").param("mblogId", "local-repost"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "invalid"))
                .andExpect(status().isBadRequest());
        upstream.verify();
    }

    @Test
    void missing_personal_status_is_unknown_rather_than_unliked() throws Exception {
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/show?id=5316949752945053&locale=zh-CN"))
                .andRespond(withSuccess("""
                        {"ok":1,"idstr":"5316949752945053","attitudes_count":7}
                        """, MediaType.APPLICATION_JSON));
        mvc.perform(get("/post/like").param("mblogId", "local-repost"))
                .andExpect(status().isBadGateway());
        upstream.verify();
    }

    @Test
    void maps_expired_credential_to_login_required() throws Exception {
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/show?id=5316949752945053&locale=zh-CN"))
                .andRespond(withSuccess("{\"error_code\":21301}", MediaType.APPLICATION_JSON));
        mvc.perform(get("/post/like").param("mblogId", "local-repost"))
                .andExpect(status().isUnauthorized());
        upstream.verify();
    }

    @Test
    void does_not_retry_limited_write_or_report_it_as_success() throws Exception {
        expectBootstrap();
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/setLike"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "true"))
                .andExpect(status().isTooManyRequests());
        upstream.verify();
    }

    @Test
    void reports_weibo_security_challenge_without_retrying_write() throws Exception {
        expectBootstrap();
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/setLike"))
                .andRespond(withSuccess("{\"ok\":0,\"error_code\":20062}", MediaType.APPLICATION_JSON));
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "true"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.msg").value("微博要求安全验证，请前往微博网页版完成验证后重试。"));
        upstream.verify();
    }

    @Test
    void write_timeout_is_an_unconfirmed_result_and_is_not_retried() throws Exception {
        expectBootstrap();
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/setLike"))
                .andRespond(withException(new SocketTimeoutException("timeout")));
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "true"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.msg").value("微博操作结果尚未确认，请查询实际状态后再重试。"));
        upstream.verify();
    }

    @Test
    void missing_xsrf_prevents_sending_a_write() throws Exception {
        upstream.expect(requestTo("https://weibo.com/"))
                .andRespond(withSuccess("<html></html>", MediaType.TEXT_HTML));
        mvc.perform(post("/post/like").param("mblogId", "local-repost").param("liked", "true"))
                .andExpect(status().isBadGateway());
        upstream.verify();
    }

    private void expectWrite(String endpoint, int liked, int count) {
        expectBootstrap();
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/" + endpoint))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string("id=5316949752945053"))
                .andExpect(header("X-XSRF-TOKEN", "xsrf/test+value"))
                .andExpect(header(HttpHeaders.COOKIE, containsString("SUB=test-credential")))
                .andExpect(header(HttpHeaders.COOKIE, containsString("XSRF-TOKEN=xsrf%2Ftest+value")))
                .andExpect(header(HttpHeaders.COOKIE, containsString("WBPSESS=web-session")))
                .andRespond(withSuccess("{\"ok\":1}", MediaType.APPLICATION_JSON));
        upstream.expect(requestTo("https://weibo.com/ajax/statuses/show?id=5316949752945053&locale=zh-CN"))
                .andRespond(withSuccess("{\"ok\":1,\"idstr\":\"5316949752945053\",\"attitudes_status\":"
                        + liked + ",\"attitudes_count\":" + count + "}", MediaType.APPLICATION_JSON));
    }

    private void expectBootstrap() {
        upstream.expect(requestTo("https://weibo.com/"))
                .andRespond(withSuccess("<html></html>", MediaType.TEXT_HTML)
                        .header(HttpHeaders.SET_COOKIE, "XSRF-TOKEN=xsrf%2Ftest+value; Path=/; Secure",
                                "WBPSESS=web-session; Path=/; Secure"));
    }
}
