package xyz.fz.weibo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "analyses")
public class AnalysisEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "gid", nullable = false)
    private long gid;

    @Column(name = "date", nullable = false)
    private long date;

    @Column(name = "prompt", nullable = false)
    private String prompt;

    @Column(name = "result", nullable = false)
    private String result;

    @Column(name = "message_count", nullable = false)
    private int messageCount;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    protected AnalysisEntity() {
    }

    public AnalysisEntity(long gid, long date, String prompt, String result, int messageCount, long createdAt) {
        this.gid = gid;
        this.date = date;
        this.prompt = prompt;
        this.result = result;
        this.messageCount = messageCount;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public long getGid() {
        return gid;
    }

    public long getDate() {
        return date;
    }

    public String getPrompt() {
        return prompt;
    }

    public String getResult() {
        return result;
    }

    public int getMessageCount() {
        return messageCount;
    }

    public long getCreatedAt() {
        return createdAt;
    }
}
