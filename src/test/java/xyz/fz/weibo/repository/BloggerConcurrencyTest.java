package xyz.fz.weibo.repository;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import xyz.fz.weibo.entity.BloggerEntity;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 回归测试：验证 upsertMetadata 在 WAL 模式下并发写不触发 SQLITE_BUSY。
 *
 * <p>根因：旧的 upsertMetadata 在单个 @Transactional 内先 findById（SELECT 读快照）
 * 再 save（UPDATE 写）。WAL 模式下，事务内的读会获取 MVCC 快照，当另一个写者
 * 在此期间提交后，当前事务的 UPDATE 因快照失效立即返回 SQLITE_BUSY，且 busy_timeout
 * 不保护此场景（快照失效不可重试）。修复方式是改为原子 INSERT ... ON CONFLICT DO UPDATE，
 * 消除事务内的前置读。
 *
 * <p>本测试用两条并发 upsertMetadata 模拟 saveByRange 与 SyncTask 并发写同一 SQLite 文件。
 * 修复前此测试稳定失败（SQLITE_BUSY），修复后应稳定通过。
 */
@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.jpa.open-in-view=false",
        "spring.sql.init.mode=always"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BloggerConcurrencyTest {

    private static final Path DATABASE = createDatabase();

    @Autowired
    private BloggerRepository bloggerRepository;

    @Autowired
    private DataSource dataSource;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> "jdbc:sqlite:" + DATABASE.toAbsolutePath() + "?busy_timeout=5000&journal_mode=WAL");
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
    void concurrent_upserts_do_not_hit_sqlite_busy() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<Throwable> writerAFailure = new AtomicReference<>();
        AtomicReference<Throwable> writerBFailure = new AtomicReference<>();

        Thread writerA = new Thread(() -> {
            try {
                start.await();
                for (long uid = 1; uid <= 50; uid++) {
                    bloggerRepository.upsertMetadata(blogger(uid, "a" + uid, uid * 10));
                }
            } catch (Throwable t) {
                writerAFailure.set(t);
            }
        }, "writer-A");

        Thread writerB = new Thread(() -> {
            try {
                start.await();
                for (long uid = 1; uid <= 50; uid++) {
                    bloggerRepository.upsertMetadata(blogger(uid, "b" + uid, uid * 20));
                }
            } catch (Throwable t) {
                writerBFailure.set(t);
            }
        }, "writer-B");

        writerA.start();
        writerB.start();
        start.countDown();
        writerA.join(30_000);
        writerB.join(30_000);

        assertThat(writerAFailure.get())
                .as("并发写不应抛出 SQLITE_BUSY").isNull();
        assertThat(writerBFailure.get())
                .as("并发写不应抛出 SQLITE_BUSY").isNull();
    }

    private BloggerEntity blogger(long uid, String screenName, long capturedAt) {
        return new BloggerEntity(uid, screenName, "avatar-" + uid, "/u/" + uid, 1,
                0, capturedAt, capturedAt);
    }

    private static Path createDatabase() {
        try {
            return Files.createTempFile("blogger-concurrency-", ".db");
        } catch (Exception e) {
            throw new IllegalStateException("创建 SQLite 测试库失败", e);
        }
    }
}
