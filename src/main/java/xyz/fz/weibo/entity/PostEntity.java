package xyz.fz.weibo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "posts")
public class PostEntity {

    @Id
    @Column(name = "mblogid", nullable = false)
    private String mblogId;

    @Column(name = "post_id", nullable = false)
    private long postId;

    @Column(name = "uid", nullable = false)
    private long uid;

    @Column(name = "content")
    private String content;

    @Column(name = "content_raw")
    private String contentRaw;

    @Column(name = "source")
    private String source;

    @Column(name = "region")
    private String region;

    @Column(name = "pics_json")
    private String picsJson;

    @Column(name = "video_cover_url")
    private String videoCoverUrl;

    @Column(name = "video_page_url")
    private String videoPageUrl;

    @Column(name = "retweeted_json")
    private String retweetedJson;

    @Column(name = "reposts_count")
    private int repostsCount;

    @Column(name = "comments_count")
    private int commentsCount;

    @Column(name = "attitudes_count")
    private int attitudesCount;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    @Column(name = "saved_at", nullable = false)
    private long savedAt;

    protected PostEntity() {
    }

    public PostEntity(String mblogId, long postId, long uid, String content, String contentRaw,
                      String source, String region, String picsJson, String videoCoverUrl,
                      String videoPageUrl, String retweetedJson, int repostsCount, int commentsCount,
                      int attitudesCount, long createdAt, long savedAt) {
        this.mblogId = mblogId;
        this.postId = postId;
        this.uid = uid;
        this.content = content;
        this.contentRaw = contentRaw;
        this.source = source;
        this.region = region;
        this.picsJson = picsJson;
        this.videoCoverUrl = videoCoverUrl;
        this.videoPageUrl = videoPageUrl;
        this.retweetedJson = retweetedJson;
        this.repostsCount = repostsCount;
        this.commentsCount = commentsCount;
        this.attitudesCount = attitudesCount;
        this.createdAt = createdAt;
        this.savedAt = savedAt;
    }

    public String getMblogId() {
        return mblogId;
    }

    public long getPostId() {
        return postId;
    }

    public long getUid() {
        return uid;
    }

    public String getContent() {
        return content;
    }

    public String getContentRaw() {
        return contentRaw;
    }

    public String getSource() {
        return source;
    }

    public String getRegion() {
        return region;
    }

    public String getPicsJson() {
        return picsJson;
    }

    public String getVideoCoverUrl() {
        return videoCoverUrl;
    }

    public String getVideoPageUrl() {
        return videoPageUrl;
    }

    public String getRetweetedJson() {
        return retweetedJson;
    }

    public int getRepostsCount() {
        return repostsCount;
    }

    public int getCommentsCount() {
        return commentsCount;
    }

    public int getAttitudesCount() {
        return attitudesCount;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public long getSavedAt() {
        return savedAt;
    }
}
