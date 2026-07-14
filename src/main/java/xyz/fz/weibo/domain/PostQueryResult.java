package xyz.fz.weibo.domain;

import java.util.List;

public record PostQueryResult(
        List<PostView> items,
        int page,
        int size,
        long total
) {
}
