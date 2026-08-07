package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.AnalysisEntity;

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
class AnalysisRepositoryTest {

    private static final Path DATABASE = createDatabase();

    @Autowired
    private AnalysisRepository analysisRepository;

    @Autowired
    private DataSource dataSource;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + DATABASE.toAbsolutePath());
        registry.add("spring.datasource.driver-class-name", () -> "org.sqlite.JDBC");
        registry.add("spring.jpa.database-platform", () -> "org.hibernate.community.dialect.SQLiteDialect");
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
    void page_request_is_zero_based_with_desc_sort() {
        var pageable = AnalysisRepository.pageRequest(2, 10);

        assertThat(pageable.getPageNumber()).isEqualTo(1);
        assertThat(pageable.getPageSize()).isEqualTo(10);
        assertThat(pageable.getSort().getOrderFor("createdAt").getDirection()).isEqualTo(Sort.Direction.DESC);
        assertThat(pageable.getSort().getOrderFor("id").getDirection()).isEqualTo(Sort.Direction.DESC);
    }

    @Test
    void save_assigns_id() {
        AnalysisEntity entity = analysis(100L, 1_000L, "提示", "结果", 1);

        AnalysisEntity saved = analysisRepository.save(entity);

        assertThat(saved.getId()).isNotNull();
    }

    @Test
    void find_page_filters_by_gid_and_sorts_newest_first() {
        analysisRepository.save(analysis(100L, 1_000L, "早的", "结果一", 1, 100L));
        analysisRepository.save(analysis(100L, 2_000L, "晚的", "结果二", 2, 200L));
        analysisRepository.save(analysis(200L, 3_000L, "别的群", "结果三", 3, 300L));

        Page<AnalysisEntity> page = analysisRepository.findPage(100L, AnalysisRepository.pageRequest(1, 20));

        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting(AnalysisEntity::getPrompt)
                .containsExactly("晚的", "早的");
    }

    private AnalysisEntity analysis(long gid, long date, String prompt, String result, int messageCount) {
        return analysis(gid, date, prompt, result, messageCount, System.currentTimeMillis());
    }

    private AnalysisEntity analysis(long gid, long date, String prompt, String result, int messageCount, long createdAt) {
        return new AnalysisEntity(gid, date, prompt, result, messageCount, createdAt);
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("analysis-repository-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create SQLite test database", e);
        }
    }
}
