package xyz.fz.weibo.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.PostEntity;

import java.util.Collection;
import java.util.List;

public interface PostRepository extends JpaRepository<PostEntity, String> {

    @Query("select coalesce(max(p.postId), 0) from PostEntity p where p.uid = :uid")
    long findMaxPostIdByUid(@Param("uid") long uid);

    @Query(value = """
            select p from PostEntity p
            where (:allUids = true or p.uid in :uids)
              and (:start is null or p.createdAt >= :start)
              and (:end is null or p.createdAt <= :end)
            """,
            countQuery = """
            select count(p) from PostEntity p
            where (:allUids = true or p.uid in :uids)
              and (:start is null or p.createdAt >= :start)
              and (:end is null or p.createdAt <= :end)
            """)
    Page<PostEntity> findFiltered(@Param("allUids") boolean allUids,
                                  @Param("uids") Collection<Long> uids,
                                  @Param("start") Long start,
                                  @Param("end") Long end,
                                  Pageable pageable);

    default Page<PostEntity> findPage(List<Long> uids, Long start, Long end, Pageable pageable) {
        boolean allUids = uids == null || uids.isEmpty();
        Collection<Long> queryUids = allUids ? List.of(0L) : uids;
        return findFiltered(allUids, queryUids, start, end, pageable);
    }

    static Pageable pageRequest(int page, int size) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("postId"));
        return PageRequest.of(page - 1, size, sort);
    }

    @Transactional
    default boolean insertIfAbsent(PostEntity post) {
        if (existsById(post.getMblogId())) {
            return false;
        }
        saveAndFlush(post);
        return true;
    }
}
