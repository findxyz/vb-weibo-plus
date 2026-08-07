package xyz.fz.weibo.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import xyz.fz.weibo.domain.AnalysisPageResult;
import xyz.fz.weibo.domain.AnalysisView;
import xyz.fz.weibo.service.AnalysisService;

import java.io.IOException;
import java.time.LocalDate;
import java.util.concurrent.CompletableFuture;

/**
 * 群聊分析接口。
 */
@RestController
@RequestMapping("/chat/analyses")
public class AnalysisController {

    private final AnalysisService analysisService;

    @Value("${weibo.ai.timeout-seconds:120}")
    private int timeoutSeconds;

    public AnalysisController(AnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    @PostMapping
    public AnalysisView analyze(
            @RequestParam long gid,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date,
            @RequestParam String prompt) {
        return analysisService.analyze(gid, date, prompt);
    }

    /**
     * 流式分析：SSE 逐段推送 delta 事件，完成后推送 done 事件（内容为 AnalysisView），失败推送 error 事件。
     */
    @PostMapping("/stream")
    public SseEmitter analyzeStream(
            @RequestParam long gid,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date,
            @RequestParam String prompt) {
        SseEmitter emitter = new SseEmitter((timeoutSeconds + 60L) * 1000L);
        CompletableFuture.runAsync(() -> {
            try {
                AnalysisView view = analysisService.analyzeStreaming(gid, date, prompt, delta -> {
                    try {
                        emitter.send(SseEmitter.event().name("delta").data(delta));
                    } catch (IOException e) {
                        throw new IllegalStateException("推送分析结果失败：" + e.getMessage(), e);
                    }
                });
                emitter.send(SseEmitter.event().name("done").data(view));
                emitter.complete();
            } catch (Exception e) {
                try {
                    emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                    emitter.complete();
                } catch (IOException ignored) {
                    emitter.completeWithError(e);
                }
            }
        });
        return emitter;
    }

    @GetMapping
    public AnalysisPageResult list(
            @RequestParam long gid,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return analysisService.list(gid, page, size);
    }

    @GetMapping("/{id}")
    public AnalysisView get(@PathVariable long id) {
        return analysisService.get(id);
    }
}
