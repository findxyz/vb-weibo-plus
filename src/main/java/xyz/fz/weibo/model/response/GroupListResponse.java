package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;

/**
 * 群聊列表响应。
 */
public record GroupListResponse(
        int totalNumber,
        List<Contact> contacts
) {

    public record Contact(GroupUser user) {
    }

    public record GroupUser(
            Long id,
            int type,
            String name,
            @JsonProperty("member_count") int memberCount,
            @JsonProperty("max_member_count") int maxMemberCount,
            @JsonProperty("avatar_large") String avatarLarge,
            Long creator,
            List<Long> admins,
            @JsonAlias("description") String summary,
            @JsonProperty("group_type") int groupType
    ) {
    }
}
