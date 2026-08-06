package xyz.fz.weibo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.GroupEntity;

import java.util.List;

public interface GroupRepository extends JpaRepository<GroupEntity, Long> {

    @Query("select g from GroupEntity g order by g.updatedAt desc, g.gid desc")
    List<GroupEntity> findAllOrdered();

    default long findMaxMid(long gid) {
        return findById(gid).map(GroupEntity::getMaxMid).orElse(0L);
    }

    default long findMinMid(long gid) {
        return findById(gid).map(GroupEntity::getMinMid).orElse(0L);
    }

    // 原子 UPSERT：消除事务内先 findById 读快照再 save 写导致的 SQLITE_BUSY。
    // DO UPDATE 只刷新 refreshMetadata 覆盖的字段，保留 min_mid、max_mid 与 created_at。
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            insert into groups (gid, name, avatar, member_count, max_member, owner_id,
                admins, summary, group_type, min_mid, max_mid, created_at, updated_at)
            values (:gid, :name, :avatar, :memberCount, :maxMember, :ownerId,
                :admins, :summary, :groupType, :minMid, :maxMid, :createdAt, :updatedAt)
            on conflict(gid) do update set
                name = excluded.name,
                avatar = excluded.avatar,
                member_count = excluded.member_count,
                max_member = excluded.max_member,
                owner_id = excluded.owner_id,
                admins = excluded.admins,
                summary = excluded.summary,
                group_type = excluded.group_type,
                updated_at = excluded.updated_at
            """, nativeQuery = true)
    int upsertIgnore(@Param("gid") long gid, @Param("name") String name,
                     @Param("avatar") String avatar, @Param("memberCount") int memberCount,
                     @Param("maxMember") int maxMember, @Param("ownerId") long ownerId,
                     @Param("admins") String admins, @Param("summary") String summary,
                     @Param("groupType") int groupType, @Param("minMid") long minMid,
                     @Param("maxMid") long maxMid, @Param("createdAt") long createdAt,
                     @Param("updatedAt") long updatedAt);

    @Transactional
    default void upsertMetadata(GroupEntity incoming) {
        upsertIgnore(incoming.getGid(), incoming.getName(), incoming.getAvatar(),
                incoming.getMemberCount(), incoming.getMaxMember(), incoming.getOwnerId(),
                incoming.getAdminsJson(), incoming.getSummary(), incoming.getGroupType(),
                incoming.getMinMid(), incoming.getMaxMid(), incoming.getCreatedAt(),
                incoming.getUpdatedAt());
    }

    @Transactional
    default void ensurePlaceholderExists(long gid, long capturedAt) {
        if (findById(gid).isPresent()) {
            return;
        }
        save(new GroupEntity(
                gid, "", "", 0, 0, 0, "[]", "", 0,
                0, 0, capturedAt, capturedAt
        ));
    }
}
