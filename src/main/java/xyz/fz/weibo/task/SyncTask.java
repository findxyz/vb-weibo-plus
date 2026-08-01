package xyz.fz.weibo.task;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.service.ChatService;
import xyz.fz.weibo.service.PostService;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class SyncTask implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SyncTask.class);

    private final ChatService chatService;
    private final PostService postService;
    private final Set<Long> autoSyncGids;

    public SyncTask(ChatService chatService, PostService postService,
                    @Value("${weibo.chat.auto-sync-gids:}") String autoSyncGids) {
        this.chatService = chatService;
        this.postService = postService;
        this.autoSyncGids = parseGids(autoSyncGids);
    }

    private static Set<Long> parseGids(String value) {
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public void run(String... args) {
        try {
            chatService.syncGroups();
        } catch (WeiboCookieExpiredException e) {
            log.warn("启动时同步群列表失败，应用将继续运行：{}", e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${weibo.chat.sync-group-fixed-delay:20s}", initialDelay = 3_000)
    public void syncGroupMessages() {
        if (autoSyncGids.isEmpty()) {
            return;
        }
        for (var group : chatService.queryGroups()) {
            if (!autoSyncGids.contains(group.gid())) {
                continue;
            }
            try {
                chatService.saveIncremental(group.gid());
            } catch (WeiboException e) {
                log.warn("群消息增量拉取失败：gid = {}，error = {}", group.gid(), e.getMessage());
            }
        }
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 600_000)
    public void syncBloggerBlogs() {
        for (var blogger : postService.queryBloggers()) {
            try {
                postService.saveIncremental(blogger.uid());
            } catch (WeiboException e) {
                log.warn("博主微博增量拉取失败：uid = {}，error = {}", blogger.uid(), e.getMessage());
            }
        }
    }
}
