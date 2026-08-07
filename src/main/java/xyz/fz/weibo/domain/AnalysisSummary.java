package xyz.fz.weibo.domain;

public record AnalysisSummary(
        Long id,
        String date,
        String promptPreview,
        int messageCount,
        String createdAt
) {
}
