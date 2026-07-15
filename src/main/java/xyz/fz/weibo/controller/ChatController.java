package xyz.fz.weibo.controller;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageQueryResult;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.service.ChatService;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private static final ZoneId REQUEST_TIME_ZONE = ZoneId.of("Asia/Shanghai");

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/groups/sync")
    public List<GroupRecord> syncGroups() {
        return chatService.syncGroups();
    }

    @GetMapping("/groups")
    public List<GroupRecord> queryGroups() {
        return chatService.queryGroups();
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

    @GetMapping("/messages")
    public MessageQueryResult queryMessages(
            @RequestParam long gid,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size) {
        return chatService.queryMessages(
                gid, toEpochMillis(start), toEpochMillis(end), page, size);
    }

    @GetMapping("/media")
    public ResponseEntity<byte[]> queryMessageMedia(
            @RequestParam long gid,
            @RequestParam long mid,
            @RequestParam String variant) {
        MediaBinary media = chatService.queryMessageMedia(gid, mid, variant);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, media.contentType())
                .body(media.content());
    }

    private Long toEpochMillis(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.atZone(REQUEST_TIME_ZONE).toInstant().toEpochMilli();
    }
}
