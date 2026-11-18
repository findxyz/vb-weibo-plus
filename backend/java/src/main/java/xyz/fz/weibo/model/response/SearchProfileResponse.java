package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record SearchProfileResponse(SearchProfileData data, int ok) {

    public record SearchProfileData(
            List<MblogResponse> list, Object total, @JsonProperty("absstr") String absStr) {}
}
