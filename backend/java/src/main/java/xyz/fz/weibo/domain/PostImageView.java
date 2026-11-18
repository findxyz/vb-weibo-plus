package xyz.fz.weibo.domain;

public record PostImageView(
        String pid,
        int thumbnailWidth,
        int thumbnailHeight,
        int originalWidth,
        int originalHeight,
        String thumbnailUrl,
        String originalUrl
) {
}
