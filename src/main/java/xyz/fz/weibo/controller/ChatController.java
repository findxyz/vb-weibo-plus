package xyz.fz.weibo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.service.ChatService;

import java.util.List;

@RestController
@RequestMapping("/chat")
public class ChatController {

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
}
