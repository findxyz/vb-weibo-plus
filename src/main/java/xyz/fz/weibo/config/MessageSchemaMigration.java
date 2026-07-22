package xyz.fz.weibo.config;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@DependsOnDatabaseInitialization
public class MessageSchemaMigration {

    private final JdbcTemplate jdbcTemplate;

    public MessageSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    void addSenderAvatarColumn() {
        List<String> columns = jdbcTemplate.query(
                "pragma table_info('messages')",
                (result, rowNumber) -> result.getString("name"));
        if (!columns.contains("sender_avatar")) {
            jdbcTemplate.execute(
                    "alter table messages add column sender_avatar varchar default ''");
        }
    }
}
