package xyz.fz.weibo.domain;

import java.util.List;

public record PostRecord(
        String mblogId,
        long postId,
        long uid,
        String content,
        String contentRaw,
        String source,
        String region,
        List<PicInfo> pics,
        VideoInfo video,
        RetweetInfo retweeted,
        int repostsCount,
        int commentsCount,
        int attitudesCount,
        long createdAt,
        long savedAt
) {
}
