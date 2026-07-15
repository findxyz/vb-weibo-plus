package xyz.fz.weibo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.GroupEntity;

import java.util.List;

public interface GroupRepository extends JpaRepository<GroupEntity, Long> {

    @Query("select g from GroupEntity g order by g.updatedAt desc, g.gid desc")
    List<GroupEntity> findAllOrdered();

    default long findMaxMid(long gid) {
        return findById(gid).map(GroupEntity::getMaxMid).orElse(0L);
    }

    @Transactional
    default void upsertMetadata(GroupEntity incoming) {
        GroupEntity current = findById(incoming.getGid()).orElse(null);
        if (current == null) {
            save(incoming);
            return;
        }
        current.refreshMetadata(incoming);
        save(current);
    }

    @Transactional
    default GroupEntity findOrCreatePlaceholder(long gid, long capturedAt) {
        return findById(gid)
                .orElseGet(() -> save(new GroupEntity(
                        gid, "", "", 0, 0, 0, "[]", "", 0,
                        0, 0, capturedAt, capturedAt
                )));
    }
}
