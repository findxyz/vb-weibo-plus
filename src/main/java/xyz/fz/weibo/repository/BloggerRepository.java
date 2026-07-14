package xyz.fz.weibo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.BloggerEntity;

import java.util.List;

public interface BloggerRepository extends JpaRepository<BloggerEntity, Long> {

    @Query("select b from BloggerEntity b order by b.updatedAt desc, b.uid desc")
    List<BloggerEntity> findAllOrdered();

    default long findLatestPostId(long uid) {
        return findById(uid).map(BloggerEntity::getLatestPostId).orElse(0L);
    }

    @Transactional
    default void upsertMetadata(BloggerEntity incoming) {
        BloggerEntity current = findById(incoming.getUid()).orElse(null);
        if (current == null) {
            save(incoming);
            return;
        }
        current.refreshMetadata(incoming);
        save(current);
    }

    @Transactional
    default void refreshLatestPostId(long uid, long latestPostId) {
        BloggerEntity blogger = findById(uid).orElseThrow();
        blogger.setLatestPostId(latestPostId);
        save(blogger);
    }
}
