package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.model.response.GroupListResponse;

import java.util.List;
import java.util.Objects;

@Component
public class MessageMapper {

    private static final TypeReference<List<Long>> ADMINS_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public MessageMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<GroupEntity> toGroupEntities(List<GroupListResponse.Contact> contacts, long capturedAt) {
        return contacts.stream()
                .filter(Objects::nonNull)
                .map(GroupListResponse.Contact::user)
                .filter(Objects::nonNull)
                .filter(user -> user.type() == 2)
                .map(user -> toGroupEntity(user, capturedAt))
                .toList();
    }

    public GroupEntity toGroupEntity(GroupListResponse.GroupUser user, long capturedAt) {
        Objects.requireNonNull(user.id(), "Group gid is required");
        return new GroupEntity(user.id(), emptyIfNull(user.name()), emptyIfNull(user.avatarLarge()),
                user.memberCount(), user.maxMemberCount(), user.creator() == null ? 0 : user.creator(),
                writeAdmins(user.admins()), emptyIfNull(user.summary()), user.groupType(),
                0, 0, capturedAt, capturedAt);
    }

    public GroupRecord toGroupRecord(GroupEntity entity) {
        return new GroupRecord(entity.getGid(), entity.getName(), entity.getAvatar(),
                entity.getMemberCount(), entity.getMaxMember(), entity.getOwnerId(),
                readAdmins(entity.getAdminsJson()), entity.getSummary(), entity.getGroupType());
    }

    public List<GroupRecord> toGroupRecords(List<GroupEntity> entities) {
        return entities.stream().map(this::toGroupRecord).toList();
    }

    private String writeAdmins(List<Long> admins) {
        try {
            return objectMapper.writeValueAsString(admins == null ? List.of() : admins);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to encode group admins", e);
        }
    }

    private List<Long> readAdmins(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, ADMINS_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to decode group admins", e);
        }
    }

    private String emptyIfNull(String value) {
        return value == null ? "" : value;
    }
}
