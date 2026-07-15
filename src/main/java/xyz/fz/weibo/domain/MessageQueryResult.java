package xyz.fz.weibo.domain;

import java.util.List;

public record MessageQueryResult(
        GroupRecord group,
        List<MessageView> items,
        int page,
        int size,
        long total
) {
}
