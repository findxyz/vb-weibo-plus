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
import xyz.fz.weibo.entity.MessageEntity;

import java.util.ArrayList;
import java.util.List;

public interface MessageRepository extends JpaRepository<MessageEntity, Long>,
        JpaSpecificationExecutor<MessageEntity> {

    @Query("""
            select m from MessageEntity m
            where m.gid = :gid
              and (:beforeCreatedAt is null
                or m.createdAt < :beforeCreatedAt
                or (m.createdAt = :beforeCreatedAt and m.mid < :beforeMid))
            order by m.createdAt desc, m.mid desc
            """)
    List<MessageEntity> findCursorPage(
            @Param("gid") long gid,
            @Param("beforeCreatedAt") Long beforeCreatedAt,
            @Param("beforeMid") Long beforeMid,
            Pageable pageable);

    @SuppressWarnings("DuplicatedCode")
    default Page<MessageEntity> findPage(long gid, Long start, Long end,
                                         String senderName, String keyword, Pageable pageable) {
        Specification<MessageEntity> specification = (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.equal(root.get("gid"), gid));
            if (start != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
            if (end != null) {
                predicates.add(builder.lessThanOrEqualTo(root.get("createdAt"), end));
            }
            if (senderName != null && !senderName.isBlank()) {
                predicates.add(builder.equal(root.get("senderName"), senderName));
            }
            if (keyword != null && !keyword.isBlank()) {
                predicates.add(builder.like(
                        root.get("text"), "%" + escapeLikePattern(keyword) + "%", '\\'));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        return findAll(specification, pageable);
    }

    static Pageable pageRequest(int page, int size) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("mid"));
        return PageRequest.of(page - 1, size, sort);
    }

    private static String escapeLikePattern(String value) {
        return value.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    @Transactional
    default boolean insertIfAbsent(MessageEntity message) {
        if (existsById(message.getMid())) {
            return false;
        }
        saveAndFlush(message);
        return true;
    }

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            update groups
            set min_mid = coalesce((select min(mid) from messages where gid = :gid), 0),
                max_mid = coalesce((select max(mid) from messages where gid = :gid), 0)
            where gid = :gid
            """, nativeQuery = true)
    void refreshGroupRange(@Param("gid") long gid);
}
