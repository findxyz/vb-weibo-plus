package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.api.DirectMediaApi;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.model.response.SearchProfileResponse;
import xyz.fz.weibo.repository.BloggerRepository;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.mapper.PostMapper;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PostController.class)
@Import(PostService.class)
@MockitoBean(types = {MyBlogApi.class, LongTextApi.class, DirectMediaApi.class,
        PostMapper.class, BloggerRepository.class, PostRepository.class})
class PostHistorySubmissionTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SearchProfileApi searchProfileApi;

    @Test
    void range_returns_before_background_capture_finishes() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(searchProfileApi.searchProfile(any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
            return new SearchProfileResponse(
                    new SearchProfileResponse.SearchProfileData(List.of(), 0, ""), 1);
        });

        try (var executor = Executors.newSingleThreadExecutor()) {
            var submission = executor.submit(() -> mockMvc.perform(post("/post/range")
                            .param("uid", "1")
                            .param("start", "2026-07-10 11:02:03")
                            .param("end", "2026-07-10 12:03:04"))
                    .andExpect(status().isNoContent())
                    .andExpect(content().string("")));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                submission.get(2, TimeUnit.SECONDS);
                assertThat(release.getCount()).isEqualTo(1);
            } finally {
                release.countDown();
            }
        }
    }
}
