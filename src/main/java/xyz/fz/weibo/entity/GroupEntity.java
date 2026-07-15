package xyz.fz.weibo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "groups")
public class GroupEntity {

    @Id
    @Column(name = "gid")
    private Long gid;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "avatar")
    private String avatar;

    @Column(name = "member_count", nullable = false)
    private int memberCount;

    @Column(name = "max_member", nullable = false)
    private int maxMember;

    @Column(name = "owner_id", nullable = false)
    private long ownerId;

    @Column(name = "admins", nullable = false)
    private String adminsJson;

    @Column(name = "summary")
    private String summary;

    @Column(name = "group_type", nullable = false)
    private int groupType;

    @Column(name = "min_mid", nullable = false)
    private long minMid;

    @Column(name = "max_mid", nullable = false)
    private long maxMid;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    @Column(name = "updated_at", nullable = false)
    private long updatedAt;

    protected GroupEntity() {
    }

    public GroupEntity(Long gid, String name, String avatar, int memberCount, int maxMember, long ownerId,
                       String adminsJson, String summary, int groupType, long minMid, long maxMid,
                       long createdAt, long updatedAt) {
        this.gid = gid;
        this.name = name;
        this.avatar = avatar;
        this.memberCount = memberCount;
        this.maxMember = maxMember;
        this.ownerId = ownerId;
        this.adminsJson = adminsJson;
        this.summary = summary;
        this.groupType = groupType;
        this.minMid = minMid;
        this.maxMid = maxMid;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public void refreshMetadata(GroupEntity source) {
        name = source.name;
        avatar = source.avatar;
        memberCount = source.memberCount;
        maxMember = source.maxMember;
        ownerId = source.ownerId;
        adminsJson = source.adminsJson;
        summary = source.summary;
        groupType = source.groupType;
        updatedAt = source.updatedAt;
    }

    public Long getGid() {
        return gid;
    }

    public String getName() {
        return name;
    }

    public String getAvatar() {
        return avatar;
    }

    public int getMemberCount() {
        return memberCount;
    }

    public int getMaxMember() {
        return maxMember;
    }

    public long getOwnerId() {
        return ownerId;
    }

    public String getAdminsJson() {
        return adminsJson;
    }

    public String getSummary() {
        return summary;
    }

    public int getGroupType() {
        return groupType;
    }

    public long getMinMid() {
        return minMid;
    }

    public long getMaxMid() {
        return maxMid;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }
}
