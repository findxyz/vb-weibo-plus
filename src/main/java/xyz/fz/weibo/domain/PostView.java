package xyz.fz.weibo.domain;

import java.util.List;

public record PostView(
        String mblogId,
        long postId,
        long uid,
        String postUrl,
        String content,
        String contentRaw,
        String source,
        String region,
        List<PostImageView> pics,
        PostVideoView video,
        RetweetView retweeted,
        int repostsCount,
        int commentsCount,
        int attitudesCount,
        long createdAt,
        long savedAt,
        BloggerRecord blogger
) {
}
