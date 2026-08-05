package xyz.fz.weibo.repository;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import xyz.fz.weibo.entity.PostEntity;

import java.util.ArrayList;
import java.util.List;

public interface PostRepository extends JpaRepository<PostEntity, String>,
        JpaSpecificationExecutor<PostEntity> {

    @Query("select coalesce(max(p.postId), 0) from PostEntity p where p.uid = :uid")
    long findMaxPostIdByUid(@Param("uid") long uid);

    @Query(value = """
            select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+8 hours') as date,
                   count(*) as count
            from posts
            where (:uid is null or uid = :uid)
            group by date
            order by date desc
            """, nativeQuery = true)
    List<DailyPostCount> findDailyCounts(@Param("uid") Long uid);

    @SuppressWarnings("DuplicatedCode")
    default Page<PostEntity> findPage(
            List<Long> uids, Long start, Long end, String keyword, Pageable pageable) {
        Specification<PostEntity> specification = (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (uids != null && !uids.isEmpty()) {
                predicates.add(root.get("uid").in(uids));
            }
            if (start != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
            if (end != null) {
                predicates.add(builder.lessThanOrEqualTo(root.get("createdAt"), end));
            }
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + escapeLike(keyword) + "%";
                var retweetedJson = builder.function(
                        "nullif", String.class, root.get("retweetedJson"), builder.literal(""));
                var retweetedContent = builder.function(
                        "json_extract", String.class, retweetedJson, builder.literal("$.content"));
                predicates.add(builder.or(
                        builder.like(root.get("content"), pattern, '\\'),
                        builder.like(retweetedContent, pattern, '\\')));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        return findAll(specification, pageable);
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    static Pageable pageRequest(int page, int size) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("postId"));
        return PageRequest.of(page - 1, size, sort);
    }

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            insert or ignore into posts (mblogid, post_id, uid, content, content_raw,
                source, region, pics_json, video_cover_url, video_page_url,
                retweeted_json, reposts_count, comments_count, attitudes_count,
                created_at, saved_at)
            values (:mblogid, :postId, :uid, :content, :contentRaw,
                :source, :region, :picsJson, :videoCoverUrl, :videoPageUrl,
                :retweetedJson, :repostsCount, :commentsCount, :attitudesCount,
                :createdAt, :savedAt)
            """, nativeQuery = true)
    int insertIgnore(@Param("mblogid") String mblogid, @Param("postId") long postId,
                     @Param("uid") long uid, @Param("content") String content,
                     @Param("contentRaw") String contentRaw, @Param("source") String source,
                     @Param("region") String region, @Param("picsJson") String picsJson,
                     @Param("videoCoverUrl") String videoCoverUrl,
                     @Param("videoPageUrl") String videoPageUrl,
                     @Param("retweetedJson") String retweetedJson,
                     @Param("repostsCount") int repostsCount,
                     @Param("commentsCount") int commentsCount,
                     @Param("attitudesCount") int attitudesCount,
                     @Param("createdAt") long createdAt, @Param("savedAt") long savedAt);

    @Transactional
    default boolean insertIfAbsent(PostEntity post) {
        return insertIgnore(
                post.getMblogId(), post.getPostId(), post.getUid(), post.getContent(),
                post.getContentRaw(), post.getSource(), post.getRegion(), post.getPicsJson(),
                post.getVideoCoverUrl(), post.getVideoPageUrl(), post.getRetweetedJson(),
                post.getRepostsCount(), post.getCommentsCount(), post.getAttitudesCount(),
                post.getCreatedAt(), post.getSavedAt()) > 0;
    }
}
