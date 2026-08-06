package xyz.fz.weibo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.BloggerEntity;

import java.util.List;

public interface BloggerRepository extends JpaRepository<BloggerEntity, Long> {

    @Query("select b from BloggerEntity b order by b.updatedAt desc, b.uid desc")
    List<BloggerEntity> findAllOrdered();

    default long findLatestPostId(long uid) {
        return findById(uid).map(BloggerEntity::getLatestPostId).orElse(0L);
    }

    // 原子 UPSERT：消除事务内先 findById 读快照再 save 写导致的 SQLITE_BUSY。
    // DO UPDATE 只刷新 refreshMetadata 覆盖的字段，保留 latest_post_id 与 created_at。
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            insert into bloggers (uid, screen_name, avatar, profile_url, verified,
                latest_post_id, created_at, updated_at)
            values (:uid, :screenName, :avatar, :profileUrl, :verified,
                :latestPostId, :createdAt, :updatedAt)
            on conflict(uid) do update set
                screen_name = excluded.screen_name,
                avatar = excluded.avatar,
                profile_url = excluded.profile_url,
                verified = excluded.verified,
                updated_at = excluded.updated_at
            """, nativeQuery = true)
    int upsertIgnore(@Param("uid") long uid, @Param("screenName") String screenName,
                     @Param("avatar") String avatar, @Param("profileUrl") String profileUrl,
                     @Param("verified") int verified, @Param("latestPostId") long latestPostId,
                     @Param("createdAt") long createdAt, @Param("updatedAt") long updatedAt);

    @Transactional
    default void upsertMetadata(BloggerEntity incoming) {
        upsertIgnore(incoming.getUid(), incoming.getScreenName(), incoming.getAvatar(),
                incoming.getProfileUrl(), incoming.getVerified(), incoming.getLatestPostId(),
                incoming.getCreatedAt(), incoming.getUpdatedAt());
    }

    // 原子 UPDATE：消除事务内先 findById 读快照再 save 写导致的 SQLITE_BUSY。
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            update bloggers set latest_post_id = :latestPostId where uid = :uid
            """, nativeQuery = true)
    int updateLatestPostId(@Param("uid") long uid, @Param("latestPostId") long latestPostId);

    default void refreshLatestPostId(long uid, long latestPostId) {
        updateLatestPostId(uid, latestPostId);
    }
}
