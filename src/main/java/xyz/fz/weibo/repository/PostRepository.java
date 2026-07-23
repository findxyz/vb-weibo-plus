package xyz.fz.weibo.repository;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
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

    @Transactional
    default boolean insertIfAbsent(PostEntity post) {
        if (existsById(post.getMblogId())) {
            return false;
        }
        saveAndFlush(post);
        return true;
    }
}
