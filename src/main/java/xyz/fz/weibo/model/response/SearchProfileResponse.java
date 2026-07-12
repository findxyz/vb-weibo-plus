package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * searchProfile 接口响应。
 * <p>
 * total 字段类型不稳定：第 1 页返回字符串 "2"，第 2 页返回数字 0，故用 Object 兼容。
 */
public record SearchProfileResponse(
        SearchProfileData data,
        int ok
) {

    public record SearchProfileData(
            List<Mblog> list,
            Object total,
            @JsonProperty("absstr") String absStr
    ) {
    }
}
