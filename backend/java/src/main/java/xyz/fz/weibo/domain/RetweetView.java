package xyz.fz.weibo.domain;

import java.util.List;

public record RetweetView(
        long postId,
        String mblogId,
        String content,
        String contentRaw,
        long uid,
        String screenName,
        long createdAt,
        List<PostImageView> pics,
        PostVideoView video
) {
}
