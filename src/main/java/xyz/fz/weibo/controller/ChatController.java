package xyz.fz.weibo.controller;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.GroupListView;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageCursorResult;
import xyz.fz.weibo.domain.MessageQueryResult;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.ChatService;
import xyz.fz.weibo.service.ImageProxyService;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private static final ZoneId REQUEST_TIME_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Pattern CONTENT_RANGE_PATTERN =
            Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)");
    private static final Pattern UNSATISFIED_CONTENT_RANGE_PATTERN =
            Pattern.compile("bytes \\*/(\\d+)");

    private final ChatService chatService;
    private final ImageProxyService imageProxyService;

    public ChatController(ChatService chatService, ImageProxyService imageProxyService) {
        this.chatService = chatService;
        this.imageProxyService = imageProxyService;
    }

    @PostMapping("/groups/sync")
    public List<GroupRecord> syncGroups() {
        return chatService.syncGroups();
    }

    @GetMapping("/groups")
    public List<GroupListView> queryGroups() {
        return chatService.queryGroupList();
    }

    @PostMapping("/incremental")
    public SaveResult saveIncremental(@RequestParam long gid) {
        return chatService.saveIncremental(gid);
    }

    @PostMapping("/since")
    public SaveResult saveBySince(
            @RequestParam long gid,
            @RequestParam
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime sinceTime,
            @RequestParam(required = false) Long beforeMid) {
        return chatService.saveBySince(gid, toEpochMillis(sinceTime), beforeMid);
    }

    @PostMapping("/messages/send")
    public SaveResult sendText(@RequestParam long gid, @RequestParam String content) {
        return chatService.sendText(gid, content);
    }

    @GetMapping("/messages")
    public MessageQueryResult queryMessages(
            @RequestParam long gid,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(required = false) String senderName,
            @RequestParam(required = false) String keyword,
            @RequestParam int page,
            @RequestParam int size) {
        return chatService.queryMessages(
                gid, toEpochMillis(start), toEpochMillis(end), senderName, keyword, page, size);
    }

    @GetMapping("/messages/cursor")
    public MessageCursorResult queryMessagesByCursor(
            @RequestParam long gid,
            @RequestParam(required = false) Long beforeCreatedAt,
            @RequestParam(required = false) Long beforeMid,
            @RequestParam(required = false) Long afterCreatedAt,
            @RequestParam(required = false) Long afterMid,
            @RequestParam int size) {
        return chatService.queryMessagesByCursor(
                gid, beforeCreatedAt, beforeMid, afterCreatedAt, afterMid, size);
    }

    @GetMapping("/media")
    public void queryMessageMedia(
            @RequestParam long gid,
            @RequestParam long mid,
            @RequestParam String variant,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
            HttpServletResponse response) throws IOException {
        if ("video".equals(variant)) {
            if (rangeHeader != null) {
                streamMessageVideoRange(gid, mid, rangeHeader, response);
                return;
            }
            chatService.streamMessageVideo(gid, mid, upstream -> {
                String contentType = upstream.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
                long contentLength = upstream.getHeaders().getContentLength();
                if (contentLength < 0) {
                    throw new WeiboException("群消息视频响应缺少 Content-Length。", -1);
                }
                response.setStatus(HttpServletResponse.SC_OK);
                response.setContentType(contentType == null || contentType.isBlank()
                        ? "application/octet-stream" : contentType);
                response.setContentLengthLong(contentLength);
                response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
                streamUntilClientDisconnects(upstream.getBody(), response.getOutputStream());
                return null;
            });
            return;
        }
        if ("file".equals(variant)) {
            MediaBinary file = chatService.downloadMessageFile(gid, mid);
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentType(file.contentType());
            response.setContentLength(file.content().length);
            response.getOutputStream().write(file.content());
            return;
        }
        MediaBinary media = chatService.queryMessageMedia(gid, mid, variant);
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(media.contentType());
        response.setContentLength(media.content().length);
        response.getOutputStream().write(media.content());
    }

    private void streamMessageVideoRange(long gid, long mid, String rangeHeader,
                                         HttpServletResponse response) {
        List<HttpRange> ranges;
        try {
            ranges = HttpRange.parseRanges(rangeHeader);
        } catch (IllegalArgumentException e) {
            throw new InvalidRequestException("Range 请求格式不正确。");
        }
        if (ranges.size() != 1) {
            throw new InvalidRequestException("仅支持单个 Range 请求。");
        }
        HttpRange requestedRange = ranges.getFirst();
        if (rangeHeader.trim().matches("bytes=-\\d+")) {
            long completeLength = probeVideoLength(gid, mid);
            requestedRange = HttpRange.createByteRange(
                    requestedRange.getRangeStart(completeLength),
                    requestedRange.getRangeEnd(completeLength));
            ranges = List.of(requestedRange);
        }
        HttpRange effectiveRange = requestedRange;
        HttpHeaders upstreamHeaders = new HttpHeaders();
        upstreamHeaders.setRange(ranges);
        chatService.streamMessageVideo(gid, mid, upstreamHeaders, upstream -> {
            String contentRange = upstream.getHeaders().getFirst(HttpHeaders.CONTENT_RANGE);
            if (upstream.getStatusCode() == HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE) {
                Matcher unsatisfied = UNSATISFIED_CONTENT_RANGE_PATTERN.matcher(
                        contentRange == null ? "" : contentRange);
                if (!unsatisfied.matches()) {
                    throw new WeiboException("群消息视频范围错误响应缺少完整长度。", -1);
                }
                response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                response.setHeader(HttpHeaders.CONTENT_RANGE,
                        "bytes */" + unsatisfied.group(1));
                response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
                return null;
            }
            Matcher matcher = CONTENT_RANGE_PATTERN.matcher(contentRange == null ? "" : contentRange);
            if (!matcher.matches()) {
                long completeLength = upstream.getHeaders().getContentLength();
                if (completeLength >= 0
                        && effectiveRange.getRangeStart(completeLength) >= completeLength) {
                    response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                    response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */" + completeLength);
                    response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
                    return null;
                }
                throw new WeiboException("群消息视频分片响应缺少有效的 Content-Range。", -1);
            }
            long start = Long.parseLong(matcher.group(1));
            long end = Long.parseLong(matcher.group(2));
            long total = Long.parseLong(matcher.group(3));
            if (start != effectiveRange.getRangeStart(total)
                    || end != effectiveRange.getRangeEnd(total)) {
                throw new WeiboException("群消息视频分片响应与请求范围不一致。", -1);
            }
            long contentLength = end - start + 1;
            if (upstream.getHeaders().getContentLength() != contentLength) {
                throw new WeiboException("群消息视频分片响应长度不正确。", -1);
            }
            String contentType = upstream.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setContentType(contentType == null || contentType.isBlank()
                    ? "application/octet-stream" : contentType);
            response.setContentLengthLong(contentLength);
            response.setHeader(HttpHeaders.CONTENT_RANGE,
                    "bytes " + start + "-" + end + "/" + total);
            response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
            streamUntilClientDisconnects(upstream.getBody(), response.getOutputStream());
            return null;
        });
    }

    private void streamUntilClientDisconnects(InputStream input, OutputStream output)
            throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            try {
                output.write(buffer, 0, read);
            } catch (IOException e) {
                return;
            }
        }
    }

    private long probeVideoLength(long gid, long mid) {
        HttpHeaders probeHeaders = new HttpHeaders();
        probeHeaders.setRange(List.of(HttpRange.createByteRange(0, 0)));
        return chatService.streamMessageVideo(gid, mid, probeHeaders, upstream -> {
            String contentRange = upstream.getHeaders().getFirst(HttpHeaders.CONTENT_RANGE);
            Matcher matcher = CONTENT_RANGE_PATTERN.matcher(contentRange == null ? "" : contentRange);
            if (!matcher.matches()
                    || Long.parseLong(matcher.group(1)) != 0
                    || Long.parseLong(matcher.group(2)) != 0
                    || upstream.getHeaders().getContentLength() != 1) {
                throw new WeiboException("群消息视频长度探测响应不正确。", -1);
            }
            return Long.parseLong(matcher.group(3));
        });
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> proxyImage(@RequestParam String url) {
        MediaBinary image = imageProxyService.fetch(url);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, image.contentType())
                .body(image.content());
    }

    private Long toEpochMillis(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.atZone(REQUEST_TIME_ZONE).toInstant().toEpochMilli();
    }
}
