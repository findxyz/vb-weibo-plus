package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import xyz.fz.weibo.config.WeiboConfig;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.model.response.GroupListResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringJUnitConfig({WeiboConfig.class, MessageMapper.class})
class MessageMapperTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MessageMapper messageMapper;

    @Test
    void convertsOnlyGroupContactsAndRoundTripsAdminsWithConfiguredObjectMapper() throws Exception {
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
    void convertsGidOnlyPlaceholderToACompleteRecord() {
        GroupEntity placeholder = new GroupEntity(
                101L, "", "", 0, 0, 0, "[]", "", 0,
                0, 0, 1_000, 1_000
        );

        GroupRecord record = messageMapper.toGroupRecord(placeholder);

        assertThat(record.gid()).isEqualTo(101);
        assertThat(record.name()).isEmpty();
        assertThat(record.admins()).isEmpty();
    }
}
