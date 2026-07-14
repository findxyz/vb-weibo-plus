package xyz.fz.weibo.domain;

public record BloggerRecord(
        long uid,
        String screenName,
        String avatar,
        String profileUrl,
        boolean verified
) {
}
