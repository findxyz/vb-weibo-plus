package xyz.fz.weibo.domain;

public record AnalysisView(
        Long id,
        long gid,
        String date,
        String prompt,
        String result,
        int messageCount,
        String createdAt
) {
}
