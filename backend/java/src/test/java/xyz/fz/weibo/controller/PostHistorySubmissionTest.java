package xyz.fz.weibo.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import xyz.fz.weibo.api.DirectMediaApi;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.api.PostDetailApi;
import xyz.fz.weibo.api.PostLikeApi;
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.model.response.SearchProfileResponse;
import xyz.fz.weibo.repository.BloggerRepository;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.mapper.PostMapper;

@WebMvcTest(PostController.class)
@Import(PostService.class)
@ImportAutoConfiguration(TaskExecutionAutoConfiguration.class)
@MockitoBean(
        types = {
            MyBlogApi.class,
            LongTextApi.class,
            DirectMediaApi.class,
            PostMapper.class,
            BloggerRepository.class,
            PostRepository.class,
            PostDetailApi.class,
            PostLikeApi.class
        })
class PostHistorySubmissionTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private SearchProfileApi searchProfileApi;

    @Test
    void range_exposes_progress_rejects_competing_request_and_retains_zero_result()
            throws Exception {
        mockMvc.perform(get("/post/range")).andExpect(status().isNoContent());
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(searchProfileApi.searchProfile(any()))
                .thenAnswer(invocation -> {
                    started.countDown();
                    assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                    return new SearchProfileResponse(
                            new SearchProfileResponse.SearchProfileData(List.of(), 0, ""), 1);
                });

        try (var executor = Executors.newSingleThreadExecutor()) {
            var submission =
                    executor.submit(() ->
                            mockMvc.perform(
                                            post("/post/range")
                                                    .param("uid", "1")
                                                    .param("start", "2026-07-10 11:02:03")
                                                    .param("end", "2026-07-10 12:03:04"))
                                    .andExpect(status().isNoContent())
                                    .andExpect(content().string("")));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                submission.get(2, TimeUnit.SECONDS);
                mockMvc.perform(get("/post/range"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.uid").value(1))
                        .andExpect(jsonPath("$.start").value("2026-07-10"))
                        .andExpect(jsonPath("$.end").value("2026-07-10"))
                        .andExpect(jsonPath("$.phase").value("RUNNING"))
                        .andExpect(jsonPath("$.currentDate").value("2026-07-10"));
                mockMvc.perform(
                                post("/post/range")
                                        .param("uid", "2")
                                        .param("start", "2026-07-10 11:02:03")
                                        .param("end", "2026-07-10 12:03:04"))
                        .andExpect(status().isConflict());
                mockMvc.perform(get("/post/range")).andExpect(jsonPath("$.uid").value(1));
            } finally {
                release.countDown();
            }
        }
        awaitPhase("SUCCEEDED")
                .andExpect(jsonPath("$.fetchedCount").value(0))
                .andExpect(jsonPath("$.insertedCount").value(0));
    }

    private ResultActions awaitPhase(String phase) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (true) {
            var result = mockMvc.perform(get("/post/range"));
            try {
                return result.andExpect(jsonPath("$.phase").value(phase));
            } catch (AssertionError error) {
                if (System.nanoTime() >= deadline) {
                    throw error;
                }
                Thread.sleep(20);
            }
        }
    }
}
