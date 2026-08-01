package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.jpa.open-in-view=false",
        "spring.sql.init.mode=always"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MessageRepositoryTest {

    private static final Path DATABASE = createDatabase();

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private DataSource dataSource;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + DATABASE.toAbsolutePath());
        registry.add("spring.datasource.driver-class-name", () -> "org.sqlite.JDBC");
        registry.add("spring.jpa.database-platform",
                () -> "org.hibernate.community.dialect.SQLiteDialect");
    }

    @AfterAll
    void deleteDatabase() throws Exception {
        if (dataSource instanceof AutoCloseable closeable) {
            closeable.close();
        }
        Files.deleteIfExists(DATABASE);
        Files.deleteIfExists(Path.of(DATABASE + "-shm"));
        Files.deleteIfExists(Path.of(DATABASE + "-wal"));
    }

    @Test
    void preserves_the_first_captured_message_and_string_media_identifiers() {
        MessageEntity original = message(100, 1, 1_000, "首次内容", "5302496155143676_file");
        MessageEntity changed = message(100, 1, 2_000, "修改内容", "numeric-compatible-123");

        assertThat(messageRepository.insertIfAbsent(original)).isTrue();
        assertThat(messageRepository.insertIfAbsent(changed)).isFalse();
        entityManager.flush();
        entityManager.clear();

        MessageEntity persisted = messageRepository.findById(100L).orElseThrow();
        assertThat(persisted.getText()).isEqualTo("首次内容");
        assertThat(persisted.getFid()).isEqualTo("5302496155143676_file");
        assertThat(persisted.getSavedAt()).isEqualTo(500);
    }

    @Test
    void refreshes_group_range_from_persisted_message_mids() {
        groupRepository.ensurePlaceholderExists(1, 100);
        messageRepository.insertIfAbsent(message(90, 1, 1_000, "旧", ""));
        messageRepository.insertIfAbsent(message(120, 1, 2_000, "新", ""));

        messageRepository.refreshGroupRange(1);
        entityManager.flush();
        entityManager.clear();

        GroupEntity group = groupRepository.findById(1L).orElseThrow();
        assertThat(group.getMinMid()).isEqualTo(90);
        assertThat(group.getMaxMid()).isEqualTo(120);
    }

    @Test
    void filters_inclusive_times_and_pages_in_stable_descending_order() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "早", ""));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "同刻小", ""));
        messageRepository.insertIfAbsent(message(102, 1, 2_000, "同刻大", ""));
        messageRepository.insertIfAbsent(message(103, 1, 3_000, "晚", ""));
        messageRepository.insertIfAbsent(message(200, 2, 2_000, "其他群", ""));

        Page<MessageEntity> page = messageRepository.findPage(
                1, 1_000L, 2_000L, null, null, MessageRepository.pageRequest(1, 2));

        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent()).extracting(MessageEntity::getMid)
                .containsExactly(102L, 101L);
    }

    @Test
    void cursor_page_does_not_shift_when_a_newer_message_is_inserted() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "最早", ""));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "较早", ""));
        messageRepository.insertIfAbsent(message(102, 1, 3_000, "较新", ""));
        messageRepository.insertIfAbsent(message(103, 1, 4_000, "最新", ""));

        List<MessageEntity> first = messageRepository.findCursorPage(
                1, null, null, PageRequest.of(0, 2));
        messageRepository.insertIfAbsent(message(104, 1, 5_000, "新增", ""));
        List<MessageEntity> second = messageRepository.findCursorPage(
                1, 3_000L, 102L, PageRequest.of(0, 2));

        assertThat(first).extracting(MessageEntity::getMid).containsExactly(103L, 102L);
        assertThat(second).extracting(MessageEntity::getMid).containsExactly(101L, 100L);
    }

    @Test
    void after_cursor_returns_the_nearest_newer_messages_without_shifting() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "最早", ""));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "锚点", ""));
        messageRepository.insertIfAbsent(message(102, 1, 2_000, "同一时刻的较新消息", ""));
        messageRepository.insertIfAbsent(message(103, 1, 4_000, "更新", ""));

        List<MessageEntity> first = messageRepository.findAfterCursorPage(
                1, 2_000L, 101L, PageRequest.of(0, 2));
        messageRepository.insertIfAbsent(message(104, 1, 5_000, "新增", ""));
        List<MessageEntity> second = messageRepository.findAfterCursorPage(
                1, 2_000L, 101L, PageRequest.of(0, 2));

        assertThat(first).extracting(MessageEntity::getMid).containsExactly(102L, 103L);
        assertThat(second).extracting(MessageEntity::getMid).containsExactly(102L, 103L);
    }

    @Test
    void filters_sender_name_by_exact_match() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "甲的消息", "", "甲"));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "同名前缀", "", "甲乙"));
        messageRepository.insertIfAbsent(message(102, 1, 3_000, "甲的新消息", "", "甲"));

        Page<MessageEntity> page = messageRepository.findPage(
                1, null, null, "甲", null, MessageRepository.pageRequest(1, 100));

        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting(MessageEntity::getMid)
                .containsExactly(102L, 100L);
    }

    @Test
    void combines_group_time_sender_and_text_filters_before_counting_and_paging() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "早期命中", "", "甲"));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "同刻命中一", "", "甲"));
        messageRepository.insertIfAbsent(message(102, 1, 2_000, "同刻命中二", "", "甲"));
        messageRepository.insertIfAbsent(message(103, 1, 2_000, "错误发言人命中", "", "乙"));
        messageRepository.insertIfAbsent(message(104, 1, 2_000, "正文不符", "命中-file", "甲"));
        messageRepository.insertIfAbsent(message(105, 1, 3_000, "时间外命中", "", "甲"));
        messageRepository.insertIfAbsent(message(200, 2, 2_000, "其他群命中", "", "甲"));

        Page<MessageEntity> page = messageRepository.findPage(
                1, 1_000L, 2_000L, "甲", "命中", MessageRepository.pageRequest(1, 2));

        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent()).extracting(MessageEntity::getMid)
                .containsExactly(102L, 101L);
    }

    @Test
    void treats_like_wildcards_and_escape_character_as_literal_keyword_text() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "进度 100%", ""));
        messageRepository.insertIfAbsent(message(101, 1, 1_000, "进度 1000", ""));
        messageRepository.insertIfAbsent(message(102, 1, 1_000, "编号 a_b", ""));
        messageRepository.insertIfAbsent(message(103, 1, 1_000, "编号 acb", ""));
        messageRepository.insertIfAbsent(message(104, 1, 1_000, "路径 C:\\temp", ""));

        assertThat(messageRepository.findPage(
                1, null, null, null, "%", MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(100L);
        assertThat(messageRepository.findPage(
                1, null, null, null, "_", MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(102L);
        assertThat(messageRepository.findPage(
                1, null, null, null, "\\", MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(104L);
    }

    @Test
    void supports_single_time_boundaries_and_ignores_blank_optional_filters() {
        messageRepository.insertIfAbsent(message(100, 1, 1_000, "早", ""));
        messageRepository.insertIfAbsent(message(101, 1, 2_000, "晚", ""));

        assertThat(messageRepository.findPage(
                1, 2_000L, null, null, null, MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(101L);
        assertThat(messageRepository.findPage(
                1, null, 1_000L, null, null, MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(100L);
        assertThat(messageRepository.findPage(
                1, null, null, "  ", "\t", MessageRepository.pageRequest(1, 100))
                .getContent()).extracting(MessageEntity::getMid).containsExactly(101L, 100L);
    }

    @Test
    void schema_provides_the_agreed_group_time_index() throws Exception {
        boolean found = false;
        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement();
             ResultSet result = statement.executeQuery("pragma index_list('messages')")) {
            while (result.next()) {
                found |= "idx_msg_gid_ctime".equals(result.getString("name"));
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void schema_provides_covering_index_for_keyword_count_and_sort() throws Exception {
        boolean found = false;
        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement();
             ResultSet result = statement.executeQuery("pragma index_list('messages')")) {
            while (result.next()) {
                found |= "idx_msg_gid_ctime_cover".equals(result.getString("name"));
            }
        }
        assertThat(found).isTrue();
    }

    private MessageEntity message(long mid, long gid, long createdAt, String text, String fid) {
        return message(mid, gid, createdAt, text, fid, "发送者");
    }

    private MessageEntity message(long mid, long gid, long createdAt, String text, String fid,
                                  String senderName) {
        return new MessageEntity(mid, gid, 321, "普通消息", fid.isEmpty() ? 0 : 1,
                9, senderName, "", text, fid, "", "", "[]", "[]", "", "{}", "[]", "",
                createdAt, 500);
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("message-repository-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create SQLite test database", e);
        }
    }
}
