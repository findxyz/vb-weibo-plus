package xyz.fz.weibo.domain;

public record PicInfo(
        String pid,
        MediaSize thumbnail,
        MediaSize original
) {
}
