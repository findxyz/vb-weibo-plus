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
import java.util.Collection;
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

    @Query("""
            select m from MessageEntity m
            where m.gid = :gid
              and (m.createdAt > :afterCreatedAt
                or (m.createdAt = :afterCreatedAt and m.mid > :afterMid))
            order by m.createdAt asc, m.mid asc
            """)
    List<MessageEntity> findAfterCursorPage(
            @Param("gid") long gid,
            @Param("afterCreatedAt") long afterCreatedAt,
            @Param("afterMid") long afterMid,
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

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = """
            insert or ignore into messages (mid, gid, msg_type, msg_type_name, media_type,
                sender_id, sender_name, sender_avatar, text, fid, video_cover_fid,
                media_orig_url, url_objects, pic_infos, template, template_data,
                recall_mids, recall_by, created_at, saved_at)
            values (:mid, :gid, :msgType, :msgTypeName, :mediaType,
                :senderId, :senderName, :senderAvatar, :text, :fid, :videoCoverFid,
                :mediaOrigUrl, :urlObjects, :picInfos, :template, :templateData,
                :recallMids, :recallBy, :createdAt, :savedAt)
            """, nativeQuery = true)
    int insertIgnore(@Param("mid") long mid, @Param("gid") long gid,
                     @Param("msgType") int msgType, @Param("msgTypeName") String msgTypeName,
                     @Param("mediaType") int mediaType, @Param("senderId") long senderId,
                     @Param("senderName") String senderName, @Param("senderAvatar") String senderAvatar,
                     @Param("text") String text, @Param("fid") String fid,
                     @Param("videoCoverFid") String videoCoverFid,
                     @Param("mediaOrigUrl") String mediaOrigUrl,
                     @Param("urlObjects") String urlObjects, @Param("picInfos") String picInfos,
                     @Param("template") String template, @Param("templateData") String templateData,
                     @Param("recallMids") String recallMids, @Param("recallBy") String recallBy,
                     @Param("createdAt") long createdAt, @Param("savedAt") long savedAt);

    @Transactional
    default boolean insertIfAbsent(MessageEntity message) {
        return insertIgnore(
                message.getMid(), message.getGid(), message.getMsgType(), message.getMsgTypeName(),
                message.getMediaType(), message.getSenderId(), message.getSenderName(),
                message.getSenderAvatar(), message.getText(), message.getFid(),
                message.getVideoCoverFid(), message.getMediaOrigUrl(), message.getUrlObjectsJson(),
                message.getPicInfosJson(), message.getTemplate(), message.getTemplateDataJson(),
                message.getRecallMidsJson(), message.getRecallBy(),
                message.getCreatedAt(), message.getSavedAt()) > 0;
    }

    /**
     * 单事务批量插入，避免增量同步边拉边写时前端轮询读到「写一半」的中间态。
     */
    @Transactional
    default int insertAllIfAbsent(List<MessageEntity> messages) {
        int inserted = 0;
        for (MessageEntity message : messages) {
            if (insertIfAbsent(message)) {
                inserted++;
            }
        }
        return inserted;
    }

    @Query(value = """
            select gid, count(*) as cnt
            from messages
            where gid in (:gids)
            group by gid
            """, nativeQuery = true)
    List<GidCount> countByGids(@Param("gids") Collection<Long> gids);

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
