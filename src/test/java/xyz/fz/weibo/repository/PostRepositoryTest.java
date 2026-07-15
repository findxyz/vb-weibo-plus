package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.BloggerEntity;
import xyz.fz.weibo.entity.PostEntity;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.jpa.open-in-view=false",
        "spring.sql.init.mode=always"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostRepositoryTest {

    private static final Path DATABASE = createDatabase();

    @Autowired
    private BloggerRepository bloggerRepository;

    @Autowired
    private PostRepository postRepository;

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
    void schema_creates_all_captured_content_tables() throws Exception {
        Set<String> tables = new HashSet<>();
        try (var connection = dataSource.getConnection();
             ResultSet result = connection.getMetaData().getTables(null, null, null, new String[]{"TABLE"})) {
            while (result.next()) {
                tables.add(result.getString("TABLE_NAME"));
            }
        }

        assertThat(tables).contains("bloggers", "posts", "groups", "messages");
    }

    @Test
    void schema_creates_indexes_for_filtered_post_timelines() throws Exception {
        Set<String> indexes = new HashSet<>();
        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement();
             ResultSet result = statement.executeQuery("pragma index_list('posts')")) {
            while (result.next()) {
                indexes.add(result.getString("name"));
            }
        }

        assertThat(indexes).contains("idx_posts_uid_ctime_post", "idx_posts_ctime_post");
    }

    @Test
    void sqlite_uses_indexes_for_filtered_post_timelines() throws Exception {
        assertThat(queryPlan("""
                select * from posts
                where uid in (1) and created_at >= 100 and created_at <= 200
                order by created_at desc, post_id desc
                """)).anyMatch(detail -> detail.contains("idx_posts_uid_ctime_post"));
        assertThat(queryPlan("""
                select * from posts
                where created_at >= 100 and created_at <= 200
                order by created_at desc, post_id desc
                """)).anyMatch(detail -> detail.contains("idx_posts_ctime_post"));
    }

    @Test
    void page_returning_repository_methods_declare_pageable_parameter() {
        assertThat(Arrays.stream(PostRepository.class.getDeclaredMethods())
                .filter(method -> method.getReturnType().equals(Page.class)))
                .allSatisfy(method -> assertThat(method.getParameterTypes())
                        .anyMatch(Pageable.class::isAssignableFrom));
    }

    @Test
    void insert_if_absent_preserves_first_captured_content() {
        assertThat(postRepository.insertIfAbsent(post("m1", 10, 1, 100, "首次正文"))).isTrue();
        assertThat(postRepository.insertIfAbsent(post("m1", 10, 1, 100, "修改后的正文"))).isFalse();

        assertThat(postRepository.findById("m1")).get()
                .extracting(PostEntity::getContent)
                .isEqualTo("首次正文");
    }

    @Test
    void find_page_uses_inclusive_filters_stable_order_and_matching_total() {
        postRepository.insertIfAbsent(post("m1", 10, 1, 100, "one"));
        postRepository.insertIfAbsent(post("m2", 20, 1, 100, "two"));
        postRepository.insertIfAbsent(post("m3", 30, 2, 200, "three"));

        Page<PostEntity> firstPage = postRepository.findPage(
                List.of(1L), 100L, 100L, PostRepository.pageRequest(1, 1));
        Page<PostEntity> secondPage = postRepository.findPage(
                List.of(1L), 100L, 100L, PostRepository.pageRequest(2, 1));

        assertThat(firstPage.getTotalElements()).isEqualTo(2);
        assertThat(firstPage.getContent()).extracting(PostEntity::getMblogId).containsExactly("m2");
        assertThat(secondPage.getTotalElements()).isEqualTo(2);
        assertThat(secondPage.getContent()).extracting(PostEntity::getMblogId).containsExactly("m1");
    }

    @Test
    void repositories_aggregate_cursor_and_refresh_metadata_without_overwriting_it() {
        bloggerRepository.upsertMetadata(blogger(1, "旧昵称", 20, 100, 100));
        postRepository.insertIfAbsent(post("m1", 10, 1, 100, "one"));
        postRepository.insertIfAbsent(post("m2", 30, 1, 200, "two"));

        assertThat(postRepository.findMaxPostIdByUid(1)).isEqualTo(30);

        bloggerRepository.upsertMetadata(blogger(1, "新昵称", 0, 999, 300));
        BloggerEntity refreshed = bloggerRepository.findById(1L).orElseThrow();

        assertThat(refreshed.getScreenName()).isEqualTo("新昵称");
        assertThat(refreshed.getLatestPostId()).isEqualTo(20);
        assertThat(refreshed.getCreatedAt()).isEqualTo(100);
        assertThat(bloggerRepository.findAllOrdered()).extracting(BloggerEntity::getUid).containsExactly(1L);
    }

    private static BloggerEntity blogger(long uid, String screenName, long cursor, long createdAt, long updatedAt) {
        return new BloggerEntity(uid, screenName, "avatar", "/u/" + uid, 1,
                cursor, createdAt, updatedAt);
    }

    private static PostEntity post(String mblogId, long postId, long uid, long createdAt, String content) {
        return new PostEntity(mblogId, postId, uid, content, "raw", "source", "region",
                "[]", "", "", "", 1, 2, 3, createdAt, 500);
    }

    private List<String> queryPlan(String sql) throws Exception {
        List<String> details = new java.util.ArrayList<>();
        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement();
             ResultSet result = statement.executeQuery("explain query plan " + sql)) {
            while (result.next()) {
                details.add(result.getString("detail"));
            }
        }
        return details;
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("post-repository-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create SQLite test database", e);
        }
    }
}
