package xyz.fz.weibo.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.MessageEntity;

@DataJpaTest(
        properties = {
            "spring.test.database.replace=none",
            "spring.jpa.hibernate.ddl-auto=none",
            "spring.jpa.open-in-view=false",
            "spring.sql.init.mode=always"
        })
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MessageConcurrencyTest {

    private static final Path DATABASE = createDatabase();

    @Autowired private MessageRepository messageRepository;

    @Autowired private GroupRepository groupRepository;

    @Autowired private DataSource dataSource;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "spring.datasource.url",
                () ->
                        "jdbc:sqlite:"
                                + DATABASE.toAbsolutePath()
                                + "?busy_timeout=5000&journal_mode=WAL");
        registry.add("spring.datasource.driver-class-name", () -> "org.sqlite.JDBC");
        registry.add(
                "spring.jpa.database-platform",
                () -> "org.hibernate.community.dialect.SQLiteDialect");
    }

    @AfterAll
    void delete_database() throws Exception {
        if (dataSource instanceof AutoCloseable closeable) {
            closeable.close();
        }
        Files.deleteIfExists(DATABASE);
        Files.deleteIfExists(Path.of(DATABASE + "-shm"));
        Files.deleteIfExists(Path.of(DATABASE + "-wal"));
    }

    @Test
    void concurrent_inserts_do_not_hit_sqlite_busy() throws Exception {
        groupRepository.ensurePlaceholderExists(1, 1_000);

        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<Throwable> firstWriterFailure = new AtomicReference<>();
        AtomicReference<Throwable> secondWriterFailure = new AtomicReference<>();

        Thread writerA =
                new Thread(
                        () -> {
                            try {
                                start.await();
                                for (long mid = 1_000; mid < 1_050; mid++) {
                                    messageRepository.insertIfAbsent(message(mid, "a"));
                                }
                            } catch (Throwable t) {
                                firstWriterFailure.set(t);
                            }
                        },
                        "writer-A");

        Thread writerB =
                new Thread(
                        () -> {
                            try {
                                start.await();
                                for (long mid = 2_000; mid < 2_050; mid++) {
                                    messageRepository.insertIfAbsent(message(mid, "b"));
                                }
                            } catch (Throwable t) {
                                secondWriterFailure.set(t);
                            }
                        },
                        "writer-B");

        writerA.start();
        writerB.start();
        start.countDown();
        writerA.join(30_000);
        writerB.join(30_000);

        assertThat(firstWriterFailure.get()).as("并发写不应抛出 SQLITE_BUSY").isNull();
        assertThat(secondWriterFailure.get()).as("并发写不应抛出 SQLITE_BUSY").isNull();
    }

    private MessageEntity message(long mid, String text) {
        return new MessageEntity(
                mid, 1, 321, "普通消息", 0, 9, "发送者", "", text, "", "", "", "[]", "[]", "", "{}", "[]",
                "", mid * 10, 500);
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("message-concurrency-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("创建 SQLite 测试库失败", e);
        }
    }
}
