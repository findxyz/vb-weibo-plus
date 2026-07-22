package xyz.fz.weibo.config;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest(properties = {
        "spring.test.database.replace=none",
        "spring.sql.init.mode=always"
})
@Import(MessageSchemaMigration.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MessageSchemaMigrationTest {

    private static final Path DATABASE = createLegacyDatabase();

    @Autowired
    private DataSource dataSource;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + DATABASE.toAbsolutePath());
        registry.add("spring.datasource.driver-class-name", () -> "org.sqlite.JDBC");
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
    void adds_sender_avatar_to_existing_messages_table() throws Exception {
        List<String> columns = new ArrayList<>();
        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement();
             var result = statement.executeQuery("pragma table_info('messages')")) {
            while (result.next()) {
                columns.add(result.getString("name"));
            }
        }

        assertThat(columns).contains("sender_avatar");
    }

    private static Path createLegacyDatabase() {
        try {
            Path database = Files.createTempFile("message-schema-migration-", ".db");
            try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath());
                 var statement = connection.createStatement()) {
                statement.execute("""
                        CREATE TABLE messages (
                            mid BIGINT PRIMARY KEY NOT NULL,
                            gid BIGINT NOT NULL,
                            msg_type INT NOT NULL DEFAULT 0,
                            msg_type_name VARCHAR DEFAULT '',
                            media_type INT DEFAULT 0,
                            sender_id BIGINT DEFAULT 0,
                            sender_name VARCHAR DEFAULT '',
                            text TEXT DEFAULT '',
                            fid VARCHAR DEFAULT '',
                            video_cover_fid VARCHAR DEFAULT '',
                            media_orig_url VARCHAR DEFAULT '',
                            url_objects TEXT DEFAULT '',
                            pic_infos TEXT DEFAULT '',
                            template VARCHAR DEFAULT '',
                            template_data TEXT DEFAULT '{}',
                            recall_mids TEXT DEFAULT '[]',
                            recall_by VARCHAR DEFAULT '',
                            created_at BIGINT NOT NULL,
                            saved_at BIGINT NOT NULL
                        )
                        """);
            }
            return database;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create legacy SQLite database", e);
        }
    }
}
