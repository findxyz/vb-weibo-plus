package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 长文响应。
 */
public record LongTextResponse(
        LongTextData data,
        int ok
) {

    public record LongTextData(
            String longTextContent,
            @JsonProperty("longTextContent_raw") String longTextContentRaw,
            @JsonProperty("isMarkdown") boolean isMarkdown,
            @JsonProperty("url_struct") Object urlStruct
    ) {
    }
}
