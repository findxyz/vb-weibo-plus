package xyz.fz.weibo.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.CalendarView;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.PostService;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/post")
public class PostController {

    private static final ZoneId REQUEST_TIME_ZONE = ZoneId.of("Asia/Shanghai");

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @PostMapping("/incremental")
    public SaveResult saveIncremental(@RequestParam long uid) {
        return postService.saveIncremental(uid);
    }

    @PostMapping("/range")
    public SaveResult saveByRange(
            @RequestParam long uid,
            @RequestParam
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end) {
        return postService.saveByRange(uid, toEpochMillis(start), toEpochMillis(end));
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> queryPostImage(
            @RequestParam String mblogId,
            @RequestParam String pid,
            @RequestParam String variant) {
        return mediaResponse(postService.queryPostImage(mblogId, pid, variant));
    }

    @GetMapping("/video-cover")
    public ResponseEntity<byte[]> queryPostVideoCover(
            @RequestParam String mblogId,
            @RequestParam(defaultValue = "false") boolean retweeted) {
        return mediaResponse(postService.queryPostVideoCover(mblogId, retweeted));
    }

    @GetMapping("/bloggers")
    public List<BloggerRecord> queryBloggers() {
        return postService.queryBloggers();
    }

    @PostMapping("/bloggers")
    public BloggerRecord addBlogger(@RequestParam long uid) {
        return postService.addBlogger(uid);
    }

    @GetMapping("/calendar")
    public CalendarView queryCalendar(@RequestParam(required = false) Long uid) {
        return postService.queryCalendar(uid);
    }

    @GetMapping("/list")
    public PostQueryResult queryPosts(
            HttpServletRequest request,
            @RequestParam(required = false) List<Long> uids,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size) {
        rejectCommaSeparatedUids(request);
        return postService.queryPosts(
                uids, toEpochMillis(start), toEpochMillis(end), keyword, page, size);
    }

    private void rejectCommaSeparatedUids(HttpServletRequest request) {
        String[] values = request.getParameterValues("uids");
        if (values == null) {
            return;
        }
        for (String value : values) {
            if (value.contains(",")) {
                throw new InvalidRequestException("uids 必须使用重复查询参数传递。");
            }
        }
    }

    private Long toEpochMillis(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.atZone(REQUEST_TIME_ZONE).toInstant().toEpochMilli();
    }

    private ResponseEntity<byte[]> mediaResponse(MediaBinary media) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, media.contentType())
                .body(media.content());
    }
}
