package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 群聊消息响应。
 */
public record GroupMessagesResponse(
        boolean result,
        List<Message> messages,
        long ts
) {

    public record Message(
            @JsonAlias("idstr")
            Long id,
            Long gid,
            int type,
            @JsonProperty("from_uid") Long fromUid,
            @JsonProperty("from_user") Sender fromUser,
            String content,
            @JsonProperty("media_type") int mediaType,
            long time,
            List<String> fids,
            String fid,
            Annotations annotations,
            @JsonProperty("media_orig_url") String mediaOrigUrl,
            @JsonProperty("url_objects") JsonNode urlObjects,
            @JsonProperty("pic_infos") JsonNode picInfos,
            String template,
            @JsonProperty("template_data") JsonNode templateData,
            JsonNode data,
            @JsonProperty("recall_mids") JsonNode recallMids,
            @JsonProperty("recall_by") String recallBy
    ) {
    }

    public record Sender(Long id, @JsonProperty("screen_name") String screenName) {
    }

    public record Annotations(@JsonProperty("video_pic_fid") String videoPicFid) {
    }
}
