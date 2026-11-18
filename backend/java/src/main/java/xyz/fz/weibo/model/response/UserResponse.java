package xyz.fz.weibo.model.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record UserResponse(
        Long id,
        @JsonProperty("screen_name") String screenName,
        @JsonProperty("profile_image_url") String profileImageUrl,
        @JsonProperty("avatar_large") String avatarLarge,
        @JsonProperty("avatar_hd") String avatarHd,
        @JsonProperty("profile_url") String profileUrl,
        boolean verified
) {
}
