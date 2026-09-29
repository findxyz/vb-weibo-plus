package xyz.fz.weibo.task;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.api.GroupPushEvent;
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
        runSafely("启动时同步群列表", chatService::syncGroups);
    }

    @Scheduled(fixedDelayString = "${weibo.chat.sync-group-fixed-delay:1m}", initialDelay = 5_000)
    public void syncGroupMessages() {
        if (autoSyncGids.isEmpty()) {
            return;
        }
        runSafely("群消息增量同步", () -> {
            for (var group : chatService.queryGroups()) {
                if (!autoSyncGids.contains(group.gid())) {
                    continue;
                }
                chatService.saveIncremental(group.gid());
            }
        });
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 5_000)
    public void openWebSocket() {
        if (!autoSyncGids.isEmpty()) {
            runSafely("微博 WebSocket 初始化", chatService::openWebSocket);
        }
    }

    @Async
    @EventListener
    public void onGroupPush(GroupPushEvent event) {
        if (!"groupchat".equals(event.data().path("type").asText())) {
            return;
        }
        long gid = event.data().path("info").path("gid").asLong();
        if (!autoSyncGids.contains(gid)) {
            return;
        }
        runSafely("群消息推送后补拉：gid = " + gid,
                () -> chatService.saveIncremental(gid));
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 5_000)
    public void syncBloggerBlogs() {
        runSafely("博主微博增量同步", () -> {
            for (var blogger : postService.queryBloggers()) {
                postService.saveIncremental(blogger.uid());
            }
        });
    }

    private void runSafely(String taskName, Runnable task) {
        try {
            task.run();
        } catch (WeiboException e) {
            log.warn("{}失败：{}", taskName, e.getMessage());
        }
    }
}
