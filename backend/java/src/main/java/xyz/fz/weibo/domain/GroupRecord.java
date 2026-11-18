package xyz.fz.weibo.domain;

import java.util.List;

public record GroupRecord(
        long gid,
        String name,
        String avatar,
        int memberCount,
        int maxMember,
        long ownerId,
        List<Long> admins,
        String summary,
        int groupType
) {
}
