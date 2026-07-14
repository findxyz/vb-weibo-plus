package xyz.fz.weibo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "bloggers")
public class BloggerEntity {

    @Id
    @Column(name = "uid")
    private Long uid;

    @Column(name = "screen_name", nullable = false)
    private String screenName;

    @Column(name = "avatar")
    private String avatar;

    @Column(name = "profile_url")
    private String profileUrl;

    @Column(name = "verified")
    private int verified;

    @Column(name = "latest_post_id")
    private long latestPostId;

    @Column(name = "created_at")
    private long createdAt;

    @Column(name = "updated_at")
    private long updatedAt;

    protected BloggerEntity() {
    }

    public BloggerEntity(Long uid, String screenName, String avatar, String profileUrl, int verified,
                         long latestPostId, long createdAt, long updatedAt) {
        this.uid = uid;
        this.screenName = screenName;
        this.avatar = avatar;
        this.profileUrl = profileUrl;
        this.verified = verified;
        this.latestPostId = latestPostId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public void refreshMetadata(BloggerEntity source) {
        screenName = source.screenName;
        avatar = source.avatar;
        profileUrl = source.profileUrl;
        verified = source.verified;
        updatedAt = source.updatedAt;
    }

    public void setLatestPostId(long latestPostId) {
        this.latestPostId = latestPostId;
    }

    public Long getUid() {
        return uid;
    }

    public String getScreenName() {
        return screenName;
    }

    public String getAvatar() {
        return avatar;
    }

    public String getProfileUrl() {
        return profileUrl;
    }

    public int getVerified() {
        return verified;
    }

    public long getLatestPostId() {
        return latestPostId;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }
}
