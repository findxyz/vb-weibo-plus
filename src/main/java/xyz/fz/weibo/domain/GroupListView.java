package xyz.fz.weibo.domain;

import java.util.List;

public record GroupListView(
        long gid,
        String name,
        String avatar,
        int memberCount,
        int maxMember,
        long ownerId,
        List<Long> admins,
        String summary,
        int groupType,
        String latestSenderName,
        String latestMessage,
        long messageCount
) {
}
