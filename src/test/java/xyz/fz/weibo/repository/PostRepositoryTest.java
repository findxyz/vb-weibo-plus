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
import java.util.ArrayList;
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
                List.of(1L), 100L, 100L, null, PostRepository.pageRequest(1, 1));
        Page<PostEntity> secondPage = postRepository.findPage(
                List.of(1L), 100L, 100L, null, PostRepository.pageRequest(2, 1));

        assertThat(firstPage.getTotalElements()).isEqualTo(2);
        assertThat(firstPage.getContent()).extracting(PostEntity::getMblogId).containsExactly("m2");
        assertThat(secondPage.getTotalElements()).isEqualTo(2);
        assertThat(secondPage.getContent()).extracting(PostEntity::getMblogId).containsExactly("m1");
    }

    @Test
    void find_page_matches_current_visible_content() {
        postRepository.insertIfAbsent(post("matching", 10, 1, 100, "当前正文包含本地搜索"));
        postRepository.insertIfAbsent(post("other", 20, 1, 200, "其他正文"));

        Page<PostEntity> page = postRepository.findPage(
                null, null, null, "本地搜索", PostRepository.pageRequest(1, 100));

        assertThat(page.getContent()).extracting(PostEntity::getMblogId)
                .containsExactly("matching");
    }

    @Test
    void find_page_matches_only_retweeted_visible_content() {
        postRepository.insertIfAbsent(post("retweeted-match", 10, 1, 100, "其他正文", """
                {"content":"转发正文包含目标文字","screen_name":"其他博主"}
                """));
        postRepository.insertIfAbsent(post("metadata-only", 20, 1, 200, "其他正文", """
                {"content":"仍是其他正文","screen_name":"目标文字"}
                """));

        Page<PostEntity> page = postRepository.findPage(
                null, null, null, "目标文字", PostRepository.pageRequest(1, 100));

        assertThat(page.getContent()).extracting(PostEntity::getMblogId)
                .containsExactly("retweeted-match");
    }

    @Test
    void find_page_treats_like_wildcards_and_escape_as_literal_text() {
        postRepository.insertIfAbsent(post("literal", 10, 1, 100, "其他正文", """
                {"content":"进度 100%_\\\\完成"}
                """));
        postRepository.insertIfAbsent(post(
                "wildcard-decoy", 20, 1, 200, "进度 100任意X\\完成"));

        Page<PostEntity> page = postRepository.findPage(
                null, null, null, "100%_\\完成", PostRepository.pageRequest(1, 100));

        assertThat(page.getContent()).extracting(PostEntity::getMblogId)
                .containsExactly("literal");
    }

    @Test
    void find_page_combines_keyword_uid_time_order_and_total_before_pagination() {
        postRepository.insertIfAbsent(post("old-boundary", 10, 1, 100, "命中正文"));
        postRepository.insertIfAbsent(post("same-time-larger-id", 20, 1, 100, "命中正文"));
        postRepository.insertIfAbsent(post("new-boundary", 30, 1, 200, "命中正文"));
        postRepository.insertIfAbsent(post("wrong-uid", 40, 2, 150, "命中正文"));
        postRepository.insertIfAbsent(post("too-old", 50, 1, 99, "命中正文"));
        postRepository.insertIfAbsent(post("wrong-content", 60, 1, 150, "其他正文"));

        Page<PostEntity> firstPage = postRepository.findPage(
                List.of(1L), 100L, 200L, "命中", PostRepository.pageRequest(1, 2));
        Page<PostEntity> secondPage = postRepository.findPage(
                List.of(1L), 100L, 200L, "命中", PostRepository.pageRequest(2, 2));

        assertThat(firstPage.getTotalElements()).isEqualTo(3);
        assertThat(firstPage.getContent()).extracting(PostEntity::getMblogId)
                .containsExactly("new-boundary", "same-time-larger-id");
        assertThat(secondPage.getTotalElements()).isEqualTo(3);
        assertThat(secondPage.getContent()).extracting(PostEntity::getMblogId)
                .containsExactly("old-boundary");
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

    @Test
    void daily_counts_aggregate_all_bloggers_by_cst_day_in_descending_order() {
        postRepository.insertIfAbsent(post("d1", 10, 1, 1783612800000L, "day1"));
        postRepository.insertIfAbsent(post("d2", 20, 1, 1783612800000L, "day1-second"));
        postRepository.insertIfAbsent(post("d3", 30, 2, 1783699200000L, "day2-other-blogger"));

        List<DailyPostCount> counts = postRepository.findDailyCounts(null);

        assertThat(counts).extracting(DailyPostCount::getDate)
                .containsExactly("2026-07-11", "2026-07-10");
        assertThat(counts.get(0).getDate()).isEqualTo("2026-07-11");
        assertThat(counts.get(0).getCount()).isEqualTo(1L);
        assertThat(counts.get(1).getDate()).isEqualTo("2026-07-10");
        assertThat(counts.get(1).getCount()).isEqualTo(2L);
    }

    @Test
    void daily_counts_filter_by_uid() {
        postRepository.insertIfAbsent(post("d1", 10, 1, 1783612800000L, "day1-blogger1"));
        postRepository.insertIfAbsent(post("d2", 20, 2, 1783612800000L, "day1-blogger2"));
        postRepository.insertIfAbsent(post("d3", 30, 1, 1783699200000L, "day2-blogger1"));

        List<DailyPostCount> counts = postRepository.findDailyCounts(1L);

        assertThat(counts).extracting(DailyPostCount::getDate)
                .containsExactly("2026-07-11", "2026-07-10");
        assertThat(counts.get(0).getCount()).isEqualTo(1L);
        assertThat(counts.get(1).getCount()).isEqualTo(1L);
    }

    @Test
    void daily_counts_use_cst_timezone_for_utc_midnight_boundary() {
        // UTC 2026-07-10T15:59:59 = CST 2026-07-10T23:59:59（同日）
        postRepository.insertIfAbsent(post("late", 10, 1, 1783699199000L, "同日末尾"));
        // UTC 2026-07-10T16:00:00 = CST 2026-07-11T00:00:00（次日）
        postRepository.insertIfAbsent(post("next", 20, 1, 1783699200000L, "次日开头"));

        List<DailyPostCount> counts = postRepository.findDailyCounts(1L);

        assertThat(counts).extracting(DailyPostCount::getDate)
                .containsExactly("2026-07-11", "2026-07-10");
        assertThat(counts.get(0).getCount()).isEqualTo(1L);
        assertThat(counts.get(1).getCount()).isEqualTo(1L);
    }

    private static BloggerEntity blogger(long uid, String screenName, long cursor, long createdAt, long updatedAt) {
        return new BloggerEntity(uid, screenName, "avatar", "/u/" + uid, 1,
                cursor, createdAt, updatedAt);
    }

    private static PostEntity post(String mblogId, long postId, long uid, long createdAt, String content) {
        return post(mblogId, postId, uid, createdAt, content, "");
    }

    private static PostEntity post(
            String mblogId, long postId, long uid, long createdAt, String content,
            String retweetedJson) {
        return new PostEntity(mblogId, postId, uid, content, "raw", "source", "region",
                "[]", "", "", retweetedJson, 1, 2, 3, createdAt, 500);
    }

    private List<String> queryPlan(String sql) throws Exception {
        List<String> details = new ArrayList<>();
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
