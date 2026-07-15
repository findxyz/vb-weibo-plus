package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.GroupEntity;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.jpa.open-in-view=false",
        "spring.sql.init.mode=always"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GroupRepositoryTest {

    private static final Path DATABASE = createDatabase();

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
    void upsertsMetadataWhilePreservingCreationTimeAndMessageCursors() {
        groupRepository.upsertMetadata(group(1, "旧群名", 10, 20, 100, 100));

        groupRepository.upsertMetadata(new GroupEntity(
                1L, "新群名", "新头像", 20, 200, 19,
                "[3,4]", "新简介", 4, 0, 0, 999, 300
        ));
        entityManager.flush();
        entityManager.clear();

        GroupEntity group = groupRepository.findById(1L).orElseThrow();
        assertThat(group.getName()).isEqualTo("新群名");
        assertThat(group.getAvatar()).isEqualTo("新头像");
        assertThat(group.getMemberCount()).isEqualTo(20);
        assertThat(group.getMaxMember()).isEqualTo(200);
        assertThat(group.getOwnerId()).isEqualTo(19);
        assertThat(group.getAdminsJson()).isEqualTo("[3,4]");
        assertThat(group.getSummary()).isEqualTo("新简介");
        assertThat(group.getGroupType()).isEqualTo(4);
        assertThat(group.getMinMid()).isEqualTo(10);
        assertThat(group.getMaxMid()).isEqualTo(20);
        assertThat(group.getCreatedAt()).isEqualTo(100);
        assertThat(group.getUpdatedAt()).isEqualTo(300);
    }

    @Test
    void createsGidOnlyPlaceholderAndReturnsStableOrder() {
        GroupEntity placeholder = groupRepository.findOrCreatePlaceholder(2, 150);
        groupRepository.upsertMetadata(group(1, "第一群", 0, 0, 100, 300));
        groupRepository.upsertMetadata(group(3, "第三群", 0, 0, 100, 300));
        entityManager.flush();
        entityManager.clear();

        GroupEntity persistedPlaceholder = groupRepository.findById(2L).orElseThrow();
        assertThat(persistedPlaceholder.getGid()).isEqualTo(2);
        assertThat(persistedPlaceholder.getName()).isEmpty();
        assertThat(persistedPlaceholder.getAdminsJson()).isEqualTo("[]");
        assertThat(persistedPlaceholder.getCreatedAt()).isEqualTo(150);
        assertThat(groupRepository.findAllOrdered())
                .extracting(GroupEntity::getGid)
                .containsExactly(3L, 1L, 2L);
    }

    private GroupEntity group(long gid, String name, long minMid, long maxMid,
                              long createdAt, long updatedAt) {
        return new GroupEntity(gid, name, "avatar-" + name, 10, 100, 9,
                "[1,2]", "简介-" + name, 3, minMid, maxMid, createdAt, updatedAt);
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("group-repository-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create SQLite test database", e);
        }
    }
}
