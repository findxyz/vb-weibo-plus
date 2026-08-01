package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MediaSize;
import xyz.fz.weibo.domain.PicInfo;
import xyz.fz.weibo.domain.PostImageView;
import xyz.fz.weibo.domain.PostRecord;
import xyz.fz.weibo.domain.PostVideoView;
import xyz.fz.weibo.domain.PostView;
import xyz.fz.weibo.domain.RetweetInfo;
import xyz.fz.weibo.domain.RetweetView;
import xyz.fz.weibo.domain.VideoInfo;
import xyz.fz.weibo.entity.BloggerEntity;
import xyz.fz.weibo.entity.PostEntity;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MblogResponse;
import xyz.fz.weibo.model.response.PageInfoResponse;
import xyz.fz.weibo.model.response.PicInfoResponse;
import xyz.fz.weibo.model.response.UserResponse;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Component
public class PostMapper {

    private static final DateTimeFormatter CREATED_AT_FORMAT =
            DateTimeFormatter.ofPattern("EEE MMM dd HH:mm:ss Z yyyy", Locale.ENGLISH);
    private static final TypeReference<List<PicInfo>> PICS_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public PostMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public BloggerEntity toBloggerEntity(UserResponse user, long capturedAt) {
        Objects.requireNonNull(user, "Blogger metadata is required");
        Objects.requireNonNull(user.id(), "Blogger uid is required");
        String avatar = firstNonBlank(user.avatarLarge(), user.profileImageUrl());
        return new BloggerEntity(user.id(), emptyIfNull(user.screenName()), avatar,
                emptyIfNull(user.profileUrl()),
                user.verified() ? 1 : 0, 0, capturedAt, capturedAt);
    }

    public PostEntity toPostEntity(MblogResponse post, LongTextResponse longText,
                                   LongTextResponse retweetedLongText, long capturedAt) {
        Objects.requireNonNull(post, "Blogger Blog entry is required");
        Objects.requireNonNull(post.id(), "Blogger Blog post id is required");
        Objects.requireNonNull(post.mblogId(), "Blogger Blog mblog id is required");
        Objects.requireNonNull(post.user(), "Blogger metadata is required");
        Objects.requireNonNull(post.user().id(), "Blogger uid is required");

        List<PicInfo> pics = toPics(post.picInfos());
        VideoInfo video = toVideo(post.pageInfo());
        RetweetInfo retweeted = toRetweetInfo(post.retweetedStatus(), retweetedLongText);
        return new PostEntity(post.mblogId(), post.id(), post.user().id(),
                content(post, longText, false), content(post, longText, true),
                stripHtml(post.source()), emptyIfNull(post.regionName()), write(pics),
                video.coverUrl(), video.pageUrl(), retweeted == null ? "" : write(retweeted),
                post.repostsCount(), post.commentsCount(), post.attitudesCount(),
                parseCreatedAt(post.createdAt()), capturedAt);
    }

    public BloggerRecord toBloggerRecord(BloggerEntity entity) {
        return new BloggerRecord(entity.getUid(), entity.getScreenName(), entity.getAvatar(),
                entity.getProfileUrl(), entity.getVerified() != 0);
    }

    public List<BloggerRecord> toBloggerRecords(List<BloggerEntity> entities) {
        return entities.stream().map(this::toBloggerRecord).toList();
    }

    public PostRecord toPostRecord(PostEntity entity) {
        return new PostRecord(entity.getMblogId(), entity.getPostId(), entity.getUid(),
                entity.getContent(), entity.getContentRaw(), entity.getSource(), entity.getRegion(),
                readPics(entity.getPicsJson()),
                new VideoInfo(emptyIfNull(entity.getVideoCoverUrl()),
                        emptyIfNull(entity.getVideoPageUrl())),
                readRetweet(entity.getRetweetedJson()), entity.getRepostsCount(),
                entity.getCommentsCount(), entity.getAttitudesCount(), entity.getCreatedAt(),
                entity.getSavedAt());
    }

    public List<PostView> toPostViews(List<PostEntity> posts, List<BloggerEntity> bloggers) {
        Map<Long, BloggerRecord> bloggerByUid = new HashMap<>();
        for (BloggerEntity blogger : bloggers) {
            bloggerByUid.put(blogger.getUid(), toBloggerRecord(blogger));
        }
        List<PostView> views = new ArrayList<>(posts.size());
        for (PostEntity entity : posts) {
            PostRecord post = toPostRecord(entity);
            BloggerRecord blogger = Objects.requireNonNull(bloggerByUid.get(post.uid()),
                    "Blogger metadata is missing");
            views.add(toPostView(post, blogger));
        }
        return List.copyOf(views);
    }

    public MediaBinary toMediaBinary(ResponseEntity<byte[]> response) {
        byte[] content = Objects.requireNonNull(response.getBody(), "Media response body is required");
        String contentType = response.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
        if (contentType == null || contentType.isBlank()) {
            contentType = "application/octet-stream";
        }
        return new MediaBinary(content, contentType);
    }

    private PostView toPostView(PostRecord post, BloggerRecord blogger) {
        return new PostView(post.mblogId(), post.postId(), post.uid(),
                "https://weibo.com/" + post.uid() + "/" + post.mblogId(), post.content(),
                post.contentRaw(), post.source(), post.region(),
                toImageViews(post.mblogId(), post.pics()),
                toVideoView(post.mblogId(), post.video(), false),
                toRetweetView(post.mblogId(), post.retweeted()), post.repostsCount(),
                post.commentsCount(), post.attitudesCount(), post.createdAt(), post.savedAt(), blogger);
    }

    private RetweetInfo toRetweetInfo(MblogResponse post, LongTextResponse longText) {
        if (post == null) {
            return null;
        }
        Objects.requireNonNull(post.id(), "Retweeted Blogger Blog post id is required");
        Objects.requireNonNull(post.mblogId(), "Retweeted Blogger Blog mblog id is required");
        Objects.requireNonNull(post.user(), "Retweeted Blogger metadata is required");
        Objects.requireNonNull(post.user().id(), "Retweeted Blogger uid is required");
        VideoInfo video = toVideo(post.pageInfo());
        return new RetweetInfo(post.id(), post.mblogId(), content(post, longText, false),
                content(post, longText, true), post.user().id(), emptyIfNull(post.user().screenName()),
                parseCreatedAt(post.createdAt()), toPics(post.picInfos()), video.coverUrl(), video.pageUrl());
    }

    private String content(MblogResponse post, LongTextResponse longText, boolean raw) {
        if (!post.isLongText()) {
            return emptyIfNull(raw ? post.textRaw() : post.text());
        }
        if (longText == null || longText.ok() != 1 || longText.data() == null) {
            throw new IllegalArgumentException("Complete Long Text response is required");
        }
        return emptyIfNull(raw
                ? longText.data().longTextContentRaw()
                : longText.data().longTextContent());
    }

    private List<PicInfo> toPics(Map<String, PicInfoResponse> source) {
        if (source == null || source.isEmpty()) {
            return List.of();
        }
        List<PicInfo> result = new ArrayList<>(source.size());
        source.forEach((pid, info) -> result.add(new PicInfo(pid,
                toMediaSize(info == null ? null : info.thumbnail()),
                toMediaSize(originalImage(info)))));
        return List.copyOf(result);
    }

    private PicInfoResponse.ApiImage originalImage(PicInfoResponse info) {
        if (info == null) {
            return null;
        }
        if (hasUrl(info.largest())) {
            return info.largest();
        }
        if (hasUrl(info.original())) {
            return info.original();
        }
        return info.large();
    }

    private boolean hasUrl(PicInfoResponse.ApiImage image) {
        return image != null && image.url() != null && !image.url().isBlank();
    }

    private MediaSize toMediaSize(PicInfoResponse.ApiImage image) {
        if (image == null) {
            return new MediaSize("", 0, 0);
        }
        return new MediaSize(emptyIfNull(image.url()), image.width(), image.height());
    }

    private VideoInfo toVideo(PageInfoResponse pageInfo) {
        if (pageInfo == null) {
            return new VideoInfo("", "");
        }
        String pageUrl = pageInfo.mediaInfo() == null
                ? ""
                : emptyIfNull(pageInfo.mediaInfo().h5Url());
        return new VideoInfo(emptyIfNull(pageInfo.pagePic()), pageUrl);
    }

    private List<PostImageView> toImageViews(String mblogId, List<PicInfo> pics) {
        return pics.stream().map(pic -> new PostImageView(pic.pid(), pic.thumbnail().width(),
                pic.thumbnail().height(), pic.original().width(), pic.original().height(),
                imageUrl(pic.thumbnail().url(), mblogId, pic.pid(), "thumbnail"),
                imageUrl(pic.original().url(), mblogId, pic.pid(), "original")))
                .toList();
    }

    private PostVideoView toVideoView(String mblogId, VideoInfo video, boolean retweeted) {
        if (video.coverUrl().isBlank()) {
            return new PostVideoView("", video.pageUrl());
        }
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/post/video-cover")
                .queryParam("mblogId", "{mblogId}");
        if (retweeted) {
            builder.queryParam("retweeted", "true");
        }
        String coverUrl = builder.encode().buildAndExpand(Map.of("mblogId", mblogId)).toUriString();
        return new PostVideoView(coverUrl, video.pageUrl());
    }

    private RetweetView toRetweetView(String mblogId, RetweetInfo retweeted) {
        if (retweeted == null) {
            return null;
        }
        return new RetweetView(retweeted.postId(), retweeted.mblogId(), retweeted.content(),
                retweeted.contentRaw(), retweeted.uid(), retweeted.screenName(), retweeted.createdAt(),
                toImageViews(mblogId, retweeted.pics()),
                toVideoView(mblogId,
                        new VideoInfo(retweeted.videoCoverUrl(), retweeted.videoPageUrl()), true));
    }

    private String imageUrl(String reference, String mblogId, String pid, String variant) {
        if (reference == null || reference.isBlank()) {
            return "";
        }
        return UriComponentsBuilder.fromPath("/post/image")
                .queryParam("mblogId", "{mblogId}")
                .queryParam("pid", "{pid}")
                .queryParam("variant", "{variant}")
                .encode()
                .buildAndExpand(Map.of("mblogId", mblogId, "pid", pid, "variant", variant))
                .toUriString();
    }

    public long parseCreatedAt(String value) {
        try {
            return ZonedDateTime.parse(value, CREATED_AT_FORMAT).toInstant().toEpochMilli();
        } catch (DateTimeParseException | NullPointerException e) {
            throw new IllegalArgumentException("Invalid Blogger Blog created_at: " + value, e);
        }
    }

    private String stripHtml(String source) {
        return emptyIfNull(source).replaceAll("<[^>]*>", "");
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to encode Blogger Blog JSON", e);
        }
    }

    private List<PicInfo> readPics(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, PICS_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to decode Blogger Blog pictures", e);
        }
    }

    private RetweetInfo readRetweet(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(value, RetweetInfo.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to decode retweeted Blogger Blog entry", e);
        }
    }

    private String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : emptyIfNull(second);
    }

    private String emptyIfNull(String value) {
        return value == null ? "" : value;
    }
}
