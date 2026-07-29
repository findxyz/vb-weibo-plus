package xyz.fz.weibo.domain;

import java.util.List;

public record MessageCursorResult(
        GroupRecord group,
        List<MessageView> items,
        int size,
        boolean hasMore,
        Long nextBeforeCreatedAt,
        Long nextBeforeMid
) {
}
