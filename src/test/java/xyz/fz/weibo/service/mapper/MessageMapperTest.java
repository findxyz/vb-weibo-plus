package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import xyz.fz.weibo.config.WeiboConfig;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MessageRecord;
import xyz.fz.weibo.domain.MessageView;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringJUnitConfig({WeiboConfig.class, MessageMapper.class})
class MessageMapperTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MessageMapper messageMapper;

    @Test
    void converts_only_group_contacts_and_round_trips_admins_with_configured_object_mapper() throws Exception {
        GroupListResponse response = objectMapper.readValue("""
                {
                  "totalNumber": 2,
                  "contacts": [
                    {
                      "user": {
                        "id": 101,
                        "type": 2,
                        "name": "测试群",
                        "member_count": 12,
                        "max_member_count": 500,
                        "avatar_large": "https://example.test/group.jpg",
                        "creator": 201,
                        "admins": [201, 202],
                        "description": "群简介",
                        "group_type": 3
                      }
                    },
                    {
                      "user": {
                        "id": 102,
                        "type": 1,
                        "name": "联系人"
                      }
                    }
                  ]
                }
                """, GroupListResponse.class);

        List<GroupEntity> entities = messageMapper.toGroupEntities(response.contacts(), 1_000);

        assertThat(entities).hasSize(1);
        GroupEntity entity = entities.getFirst();
        assertThat(entity.getGid()).isEqualTo(101);
        assertThat(entity.getName()).isEqualTo("测试群");
        assertThat(entity.getAvatar()).isEqualTo("https://example.test/group.jpg");
        assertThat(entity.getMemberCount()).isEqualTo(12);
        assertThat(entity.getMaxMember()).isEqualTo(500);
        assertThat(entity.getOwnerId()).isEqualTo(201);
        assertThat(entity.getAdminsJson()).isEqualTo("[201,202]");
        assertThat(entity.getSummary()).isEqualTo("群简介");
        assertThat(entity.getGroupType()).isEqualTo(3);
        assertThat(entity.getMinMid()).isZero();
        assertThat(entity.getMaxMid()).isZero();
        assertThat(entity.getCreatedAt()).isEqualTo(1_000);
        assertThat(entity.getUpdatedAt()).isEqualTo(1_000);

        GroupRecord record = messageMapper.toGroupRecord(entity);
        assertThat(record.admins()).containsExactly(201L, 202L);
        assertThat(record.summary()).isEqualTo("群简介");
    }

    @Test
    void converts_gid_only_placeholder_to_a_complete_record() {
        GroupEntity placeholder = new GroupEntity(
                101L, "", "", 0, 0, 0, "[]", "", 0,
                0, 0, 1_000, 1_000
        );

        GroupRecord record = messageMapper.toGroupRecord(placeholder);

        assertThat(record.gid()).isEqualTo(101);
        assertThat(record.name()).isEmpty();
        assertThat(record.admins()).isEmpty();
    }

    @Test
    void converts_complete_upstream_message_and_round_trips_structured_json() throws Exception {
        GroupMessagesResponse response = objectMapper.readValue("""
                {
                  "result": true,
                  "messages": [{
                    "id": "5302496155143676",
                    "type": 321,
                    "content": "图片消息",
                    "media_type": 1,
                    "time": 1718000000,
                    "from_uid": 8,
                    "from_user": {"id": 9, "screen_name": "发送者"},
                    "fids": ["5302496155143676_file"],
                    "annotations": {"video_pic_fid": "5302496155143676_cover"},
                    "media_orig_url": "https://upstream.example/media",
                    "url_objects": [{"url": "https://example.test"}],
                    "pic_infos": {"pid": "p1"},
                    "template": "{{name.DATA}}",
                    "template_data": {"name": {"value": "成员"}},
                    "recall_mids": ["10", 11],
                    "recall_by": "管理员"
                  }],
                  "ts": 1718000001
                }
                """, GroupMessagesResponse.class);

        MessageEntity entity = messageMapper.toMessageEntity(
                response.messages().getFirst(), 101, 2_000).orElseThrow();

        assertThat(entity.getMid()).isEqualTo(5_302_496_155_143_676L);
        assertThat(entity.getGid()).isEqualTo(101);
        assertThat(entity.getMsgTypeName()).isEqualTo("普通消息");
        assertThat(entity.getSenderId()).isEqualTo(9);
        assertThat(entity.getSenderName()).isEqualTo("发送者");
        assertThat(entity.getFid()).isEqualTo("5302496155143676_file");
        assertThat(entity.getVideoCoverFid()).isEqualTo("5302496155143676_cover");
        assertThat(entity.getCreatedAt()).isEqualTo(1_718_000_000_000L);
        assertThat(entity.getSavedAt()).isEqualTo(2_000);

        MessageRecord record = messageMapper.toMessageRecord(entity);
        assertThat(record.urlObjects()).containsExactly(
                java.util.Map.of("url", "https://example.test"));
        assertThat(record.picInfos()).containsExactly(java.util.Map.of("pid", "p1"));
        assertThat(record.templateData()).containsKey("name");
        assertThat(record.recallMids()).containsExactly("10", "11");
        assertThat(record.mediaOrigUrl()).isEqualTo("https://upstream.example/media");
    }

    @Test
    void filters_protocol_events_and_names_unknown_message_types() throws Exception {
        GroupMessagesResponse response = objectMapper.readValue("""
                {
                  "result": true,
                  "messages": [
                    {"id": 1, "type": 332, "time": 1},
                    {"id": 2, "type": 9999, "time": 1},
                    {"id": 3, "type": 777, "time": 1}
                  ]
                }
                """, GroupMessagesResponse.class);

        assertThat(messageMapper.toMessageEntity(response.messages().get(0), 101, 2_000)).isEmpty();
        assertThat(messageMapper.toMessageEntity(response.messages().get(1), 101, 2_000)).isEmpty();
        assertThat(messageMapper.toMessageEntity(response.messages().get(2), 101, 2_000)
                .orElseThrow().getMsgTypeName()).isEqualTo("未知(777)");
    }

    @Test
    void creates_local_media_placeholders_without_exposing_saved_references() {
        MessageEntity image = new MessageEntity(100L, 101, 321, "普通消息", 1,
                9, "发送者", "图片", "image-fid", "", "upstream", "[]", "[]", "", "{}",
                "[]", "", 1_000, 2_000);
        MessageEntity video = new MessageEntity(200L, 101, 321, "普通消息", 10,
                9, "发送者", "视频", "video-fid", "cover-fid", "upstream", "[]", "[]", "", "{}",
                "[]", "", 1_000, 2_000);
        MessageEntity unsupported = new MessageEntity(300L, 101, 321, "普通消息", 0,
                9, "发送者", "文本", "", "stray-cover", "", "[]", "[]", "", "{}",
                "[]", "", 1_000, 2_000);

        List<MessageView> views = messageMapper.toMessageViews(List.of(image, video, unsupported));

        assertThat(views.get(0).previewUrl())
                .isEqualTo("/chat/media?gid=101&mid=100&variant=preview");
        assertThat(views.get(0).originalUrl())
                .isEqualTo("/chat/media?gid=101&mid=100&variant=original");
        assertThat(views.get(1).previewUrl())
                .isEqualTo("/chat/media?gid=101&mid=200&variant=preview");
        assertThat(views.get(1).originalUrl()).isEmpty();
        assertThat(views.get(2).previewUrl()).isEmpty();
        assertThat(views.get(2).originalUrl()).isEmpty();
        assertThat(objectMapper.valueToTree(views).toString())
                .doesNotContain("image-fid", "video-fid", "cover-fid", "stray-cover", "upstream");
    }

    @Test
    void converts_media_bytes_and_defaults_missing_content_type() {
        MediaBinary typed = messageMapper.toMediaBinary(ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "image/jpeg")
                .body(new byte[]{1, 2}));
        MediaBinary untyped = messageMapper.toMediaBinary(ResponseEntity.ok(new byte[]{3}));

        assertThat(typed.content()).containsExactly(1, 2);
        assertThat(typed.contentType()).isEqualTo("image/jpeg");
        assertThat(untyped.content()).containsExactly(3);
        assertThat(untyped.contentType()).isEqualTo("application/octet-stream");
    }
}
