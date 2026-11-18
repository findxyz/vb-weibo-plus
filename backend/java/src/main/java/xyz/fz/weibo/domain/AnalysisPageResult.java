package xyz.fz.weibo.domain;

import java.util.List;

public record AnalysisPageResult(
        List<AnalysisSummary> items,
        int page,
        int size,
        long total
) {
}
