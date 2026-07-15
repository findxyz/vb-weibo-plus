package xyz.fz.weibo.domain;

import java.util.List;
import java.util.Map;

public record MessageRecord(
        long mid,
        long gid,
        int msgType,
        String msgTypeName,
        int mediaType,
        long senderId,
        String senderName,
        String text,
        String fid,
        String videoCoverFid,
        String mediaOrigUrl,
        List<Map<String, Object>> urlObjects,
        List<Map<String, Object>> picInfos,
        String template,
        Map<String, Object> templateData,
        List<String> recallMids,
        String recallBy,
        long createdAt,
        long savedAt
) {
}
