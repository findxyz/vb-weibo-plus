package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageRecord;
import xyz.fz.weibo.domain.MessageView;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Component
public class MessageMapper {

    private static final TypeReference<List<Long>> ADMINS_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<Map<String, Object>>> OBJECT_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Object>> OBJECT_MAP_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {
    };
    private static final Map<Integer, String> MESSAGE_TYPE_NAMES = Map.ofEntries(
            Map.entry(100, "微博分享"), Map.entry(320, "邀请入群"),
            Map.entry(321, "普通消息"), Map.entry(322, "新人入群"),
            Map.entry(323, "退群"), Map.entry(324, "被踢出群"),
            Map.entry(325, "群名修改"), Map.entry(327, "群主转让"),
            Map.entry(331, "消息撤回"), Map.entry(332, "协议同步"),
            Map.entry(333, "免打扰变更"), Map.entry(335, "群信息更新"),
            Map.entry(337, "管理员变更"), Map.entry(421, "入群申请"),
            Map.entry(429, "被移出群"), Map.entry(499, "群通知"),
            Map.entry(9999, "态度更新")
    );

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

    public GroupRecord toEmptyGroupRecord(long gid) {
        return new GroupRecord(gid, "", "", 0, 0, 0, List.of(), "", 0);
    }

    public Optional<MessageEntity> toMessageEntity(GroupMessagesResponse.Message message,
                                                    long defaultGid, long capturedAt) {
        Objects.requireNonNull(message, "Group Message is required");
        if (message.type() == 332 || message.type() == 9999) {
            return Optional.empty();
        }
        Objects.requireNonNull(message.id(), "Group Message mid is required");
        long gid = message.gid() == null ? defaultGid : message.gid();
        GroupMessagesResponse.Sender sender = message.fromUser();
        long senderId = sender != null && sender.id() != null
                ? sender.id()
                : message.fromUid() == null ? 0 : message.fromUid();
        String senderName = sender == null ? "" : emptyIfNull(sender.screenName());
        String fid = firstFid(message);
        String videoCoverFid = message.annotations() == null
                ? ""
                : emptyIfNull(message.annotations().videoPicFid());
        JsonNode templateData = objectNodeOrDefault(message.templateData(), message.data());
        JsonNode recallMids = recallMids(message);
        String recallBy = recallBy(message, senderName);
        long createdAt = toMessageTimestamp(message);
        return Optional.of(new MessageEntity(message.id(), gid, message.type(),
                messageTypeName(message.type()), message.mediaType(), senderId, senderName,
                emptyIfNull(message.content()), fid, videoCoverFid,
                emptyIfNull(message.mediaOrigUrl()), writeJson(arrayNode(message.urlObjects())),
                writeJson(arrayNode(message.picInfos())), emptyIfNull(message.template()),
                writeJson(templateData), writeJson(recallMids), recallBy, createdAt, capturedAt));
    }

    public long toMessageTimestamp(GroupMessagesResponse.Message message) {
        Objects.requireNonNull(message, "Group Message is required");
        return message.time() < 1_000_000_000_000L
                ? message.time() * 1_000L
                : message.time();
    }

    public MessageRecord toMessageRecord(MessageEntity entity) {
        return new MessageRecord(entity.getMid(), entity.getGid(), entity.getMsgType(),
                entity.getMsgTypeName(), entity.getMediaType(), entity.getSenderId(),
                entity.getSenderName(), entity.getText(), entity.getFid(),
                entity.getVideoCoverFid(), entity.getMediaOrigUrl(),
                readJson(entity.getUrlObjectsJson(), OBJECT_LIST_TYPE, List.of()),
                readJson(entity.getPicInfosJson(), OBJECT_LIST_TYPE, List.of()),
                entity.getTemplate(),
                readJson(entity.getTemplateDataJson(), OBJECT_MAP_TYPE, Map.of()),
                readJson(entity.getRecallMidsJson(), STRING_LIST_TYPE, List.of()),
                entity.getRecallBy(), entity.getCreatedAt(), entity.getSavedAt());
    }

    public List<MessageView> toMessageViews(List<MessageEntity> entities) {
        return entities.stream().map(this::toMessageRecord).map(this::toMessageView).toList();
    }

    public MediaBinary toMediaBinary(ResponseEntity<byte[]> response) {
        byte[] content = Objects.requireNonNull(
                response.getBody(), "Group Message media response body is required");
        String contentType = response.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
        if (contentType == null || contentType.isBlank()) {
            contentType = "application/octet-stream";
        }
        return new MediaBinary(content, contentType);
    }

    private MessageView toMessageView(MessageRecord record) {
        String previewUrl = "";
        String originalUrl = "";
        if (record.mediaType() == 1 && !record.fid().isBlank()) {
            previewUrl = mediaUrl(record.gid(), record.mid(), "preview");
            originalUrl = mediaUrl(record.gid(), record.mid(), "original");
        } else if (record.mediaType() == 10 && !record.videoCoverFid().isBlank()) {
            previewUrl = mediaUrl(record.gid(), record.mid(), "preview");
        }
        return new MessageView(record.mid(), record.gid(), record.msgType(), record.msgTypeName(),
                record.mediaType(), record.senderId(), record.senderName(), record.text(),
                record.urlObjects(), record.picInfos(), record.template(), record.templateData(),
                record.recallMids(), record.recallBy(), record.createdAt(), record.savedAt(),
                previewUrl, originalUrl);
    }

    private String mediaUrl(long gid, long mid, String variant) {
        return UriComponentsBuilder.fromPath("/chat/media")
                .queryParam("gid", "{gid}")
                .queryParam("mid", "{mid}")
                .queryParam("variant", "{variant}")
                .encode()
                .buildAndExpand(Map.of("gid", gid, "mid", mid, "variant", variant))
                .toUriString();
    }

    private String firstFid(GroupMessagesResponse.Message message) {
        if (message.fids() != null && !message.fids().isEmpty()) {
            return emptyIfNull(message.fids().getFirst());
        }
        return emptyIfNull(message.fid());
    }

    private String messageTypeName(int type) {
        return MESSAGE_TYPE_NAMES.getOrDefault(type, "未知(" + type + ")");
    }

    private JsonNode arrayNode(JsonNode value) {
        if (value == null || value.isNull()) {
            return objectMapper.createArrayNode();
        }
        if (value.isArray()) {
            return value;
        }
        ArrayNode result = objectMapper.createArrayNode();
        result.add(value);
        return result;
    }

    private JsonNode objectNodeOrDefault(JsonNode preferred, JsonNode fallback) {
        if (preferred != null && preferred.isObject()) {
            return preferred;
        }
        if (fallback != null && fallback.isObject()) {
            return fallback;
        }
        return objectMapper.createObjectNode();
    }

    private JsonNode recallMids(GroupMessagesResponse.Message message) {
        JsonNode value = message.recallMids();
        if ((value == null || value.isNull()) && message.data() != null) {
            value = message.data().get("ids");
        }
        ArrayNode result = objectMapper.createArrayNode();
        if (value == null || value.isNull()) {
            return result;
        }
        if (value.isArray()) {
            value.forEach(item -> result.add(item.asText()));
        } else {
            result.add(value.asText());
        }
        return result;
    }

    private String recallBy(GroupMessagesResponse.Message message, String senderName) {
        if (message.recallBy() != null) {
            return message.recallBy();
        }
        if (message.data() != null && message.data().has("recall_sender_name")) {
            return message.data().get("recall_sender_name").asText("");
        }
        return message.type() == 331 ? senderName : "";
    }

    private String writeJson(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to encode Group Message JSON", e);
        }
    }

    private <T> T readJson(String value, TypeReference<T> type, T defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to decode Group Message JSON", e);
        }
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
