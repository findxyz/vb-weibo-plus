package xyz.fz.weibo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "messages")
public class MessageEntity {

    @Id
    @Column(name = "mid")
    private Long mid;

    @Column(name = "gid", nullable = false)
    private long gid;

    @Column(name = "msg_type", nullable = false)
    private int msgType;

    @Column(name = "msg_type_name")
    private String msgTypeName;

    @Column(name = "media_type")
    private int mediaType;

    @Column(name = "sender_id")
    private long senderId;

    @Column(name = "sender_name")
    private String senderName;

    @Column(name = "text")
    private String text;

    @Column(name = "fid")
    private String fid;

    @Column(name = "video_cover_fid")
    private String videoCoverFid;

    @Column(name = "media_orig_url")
    private String mediaOrigUrl;

    @Column(name = "url_objects")
    private String urlObjectsJson;

    @Column(name = "pic_infos")
    private String picInfosJson;

    @Column(name = "template")
    private String template;

    @Column(name = "template_data")
    private String templateDataJson;

    @Column(name = "recall_mids")
    private String recallMidsJson;

    @Column(name = "recall_by")
    private String recallBy;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    @Column(name = "saved_at", nullable = false)
    private long savedAt;

    protected MessageEntity() {
    }

    public MessageEntity(Long mid, long gid, int msgType, String msgTypeName, int mediaType,
                         long senderId, String senderName, String text, String fid,
                         String videoCoverFid, String mediaOrigUrl, String urlObjectsJson,
                         String picInfosJson, String template, String templateDataJson,
                         String recallMidsJson, String recallBy, long createdAt, long savedAt) {
        this.mid = mid;
        this.gid = gid;
        this.msgType = msgType;
        this.msgTypeName = msgTypeName;
        this.mediaType = mediaType;
        this.senderId = senderId;
        this.senderName = senderName;
        this.text = text;
        this.fid = fid;
        this.videoCoverFid = videoCoverFid;
        this.mediaOrigUrl = mediaOrigUrl;
        this.urlObjectsJson = urlObjectsJson;
        this.picInfosJson = picInfosJson;
        this.template = template;
        this.templateDataJson = templateDataJson;
        this.recallMidsJson = recallMidsJson;
        this.recallBy = recallBy;
        this.createdAt = createdAt;
        this.savedAt = savedAt;
    }

    public Long getMid() {
        return mid;
    }

    public long getGid() {
        return gid;
    }

    public int getMsgType() {
        return msgType;
    }

    public String getMsgTypeName() {
        return msgTypeName;
    }

    public int getMediaType() {
        return mediaType;
    }

    public long getSenderId() {
        return senderId;
    }

    public String getSenderName() {
        return senderName;
    }

    public String getText() {
        return text;
    }

    public String getFid() {
        return fid;
    }

    public String getVideoCoverFid() {
        return videoCoverFid;
    }

    public String getMediaOrigUrl() {
        return mediaOrigUrl;
    }

    public String getUrlObjectsJson() {
        return urlObjectsJson;
    }

    public String getPicInfosJson() {
        return picInfosJson;
    }

    public String getTemplate() {
        return template;
    }

    public String getTemplateDataJson() {
        return templateDataJson;
    }

    public String getRecallMidsJson() {
        return recallMidsJson;
    }

    public String getRecallBy() {
        return recallBy;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public long getSavedAt() {
        return savedAt;
    }
}
