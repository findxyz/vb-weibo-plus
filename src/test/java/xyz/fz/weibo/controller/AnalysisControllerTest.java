package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import xyz.fz.weibo.domain.AnalysisPageResult;
import xyz.fz.weibo.domain.AnalysisSummary;
import xyz.fz.weibo.domain.AnalysisView;
import xyz.fz.weibo.service.AnalysisService;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AnalysisController.class)
class AnalysisControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AnalysisService analysisService;

    @Test
    void analyze_returns_view() throws Exception {
        when(analysisService.analyze(1L, LocalDate.of(2026, 8, 7), "分析一下"))
                .thenReturn(new AnalysisView(9L, 1L, "2026-08-07", "分析一下", "结果", 5, "2026-08-07 10:00:00"));

        mockMvc.perform(post("/chat/analyses")
                        .param("gid", "1")
                        .param("date", "2026-08-07")
                        .param("prompt", "分析一下"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(9))
                .andExpect(jsonPath("$.gid").value(1))
                .andExpect(jsonPath("$.date").value("2026-08-07"))
                .andExpect(jsonPath("$.prompt").value("分析一下"))
                .andExpect(jsonPath("$.result").value("结果"))
                .andExpect(jsonPath("$.messageCount").value(5))
                .andExpect(jsonPath("$.createdAt").value("2026-08-07 10:00:00"));
    }

    @Test
    void analyze_returns_400_when_required_param_missing() throws Exception {
        mockMvc.perform(post("/chat/analyses")
                        .param("gid", "1")
                        .param("date", "2026-08-07"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void analyze_maps_invalid_request_to_400() throws Exception {
        when(analysisService.analyze(eq(1L), any(), eq("分析一下")))
                .thenThrow(new InvalidRequestException("该日期无本地消息，请先同步。"));

        mockMvc.perform(post("/chat/analyses")
                        .param("gid", "1")
                        .param("date", "2026-08-07")
                        .param("prompt", "分析一下"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("该日期无本地消息，请先同步。"));
    }

    @Test
    void list_returns_page_result_with_defaults() throws Exception {
        when(analysisService.list(1L, 1, 20)).thenReturn(new AnalysisPageResult(
                List.of(new AnalysisSummary(9L, "2026-08-07", "分析一下", 5, "2026-08-07 10:00:00")),
                1, 20, 1));

        mockMvc.perform(get("/chat/analyses").param("gid", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(9))
                .andExpect(jsonPath("$.items[0].promptPreview").value("分析一下"));
    }

    @Test
    void list_accepts_custom_page_and_size() throws Exception {
        when(analysisService.list(1L, 2, 50)).thenReturn(new AnalysisPageResult(
                List.of(), 2, 50, 0));

        mockMvc.perform(get("/chat/analyses")
                        .param("gid", "1")
                        .param("page", "2")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.size").value(50));
    }

    @Test
    void list_maps_invalid_request_to_400() throws Exception {
        when(analysisService.list(1L, 0, 20))
                .thenThrow(new InvalidRequestException("page 必须大于等于 1。"));

        mockMvc.perform(get("/chat/analyses")
                        .param("gid", "1")
                        .param("page", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("page 必须大于等于 1。"));
    }

    @Test
    void get_returns_view() throws Exception {
        when(analysisService.get(9L)).thenReturn(new AnalysisView(
                9L, 1L, "2026-08-07", "分析一下", "结果", 5, "2026-08-07 10:00:00"));

        mockMvc.perform(get("/chat/analyses/9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(9))
                .andExpect(jsonPath("$.result").value("结果"));
    }

    @Test
    void get_maps_not_found_to_400() throws Exception {
        when(analysisService.get(9L)).thenThrow(new InvalidRequestException("分析记录不存在。"));

        mockMvc.perform(get("/chat/analyses/9"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("分析记录不存在。"));
    }

    @Test
    void stream_emits_delta_and_done_events() throws Exception {
        // 桩 analyzeStreaming：同步回调 delta 并返回最终 view
        AtomicReference<Consumer<String>> captured = new AtomicReference<>();
        when(analysisService.analyzeStreaming(eq(1L), eq(LocalDate.of(2026, 8, 7)), eq("分析一下"), any()))
                .thenAnswer(inv -> {
                    Consumer<String> consumer = inv.getArgument(3);
                    captured.set(consumer);
                    consumer.accept("第一");
                    consumer.accept("段");
                    return new AnalysisView(9L, 1L, "2026-08-07", "分析一下", "第一段", 2, "2026-08-07 10:00:00");
                });

        MvcResult start = mockMvc.perform(post("/chat/analyses/stream")
                        .param("gid", "1")
                        .param("date", "2026-08-07")
                        .param("prompt", "分析一下"))
                .andExpect(request().asyncStarted())
                .andExpect(header().string("Content-Type", "text/event-stream"))
                .andReturn();

        mockMvc.perform(asyncDispatch(start))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:delta")))
                .andExpect(content().string(containsString("event:done")))
                .andExpect(content().string(containsString("\"id\":9")));
    }
}
