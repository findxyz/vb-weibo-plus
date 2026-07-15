package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSet;

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
                1, 1_000L, 2_000L, MessageRepository.pageRequest(1, 2));

        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent()).extracting(MessageEntity::getMid)
                .containsExactly(102L, 101L);
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

    private MessageEntity message(long mid, long gid, long createdAt, String text, String fid) {
        return new MessageEntity(mid, gid, 321, "普通消息", fid.isEmpty() ? 0 : 1,
                9, "发送者", text, fid, "", "", "[]", "[]", "", "{}", "[]", "",
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
