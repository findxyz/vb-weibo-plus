package xyz.fz.weibo.task;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import xyz.fz.weibo.WeiboApplication;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.service.ChatService;
import xyz.fz.weibo.service.PostService;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SyncTaskTest {

    @Mock
    private ChatService chatService;

    @Mock
    private PostService postService;

    private SyncTask syncTask;

    @BeforeEach
    void setUp() {
        syncTask = new SyncTask(chatService, postService, "4761715839862414");
    }

    @Test
    void application_start_syncs_groups_once() {
        syncTask.run();

        verify(chatService).syncGroups();
    }

    @Test
    void application_start_continues_when_group_sync_requires_login() {
        doThrow(new WeiboCookieExpiredException("未登录。"))
                .when(chatService).syncGroups();

        assertThatCode(syncTask::run).doesNotThrowAnyException();
    }

    @Test
    void group_message_check_only_syncs_configured_groups() {
        when(chatService.queryGroups()).thenReturn(List.of(group(4761715839862414L), group(202)));

        syncTask.syncGroupMessages();

        verify(chatService).saveIncremental(4761715839862414L);
        verify(chatService, org.mockito.Mockito.never()).saveIncremental(202);
    }

    @Test
    void group_message_check_continues_after_one_group_fails() {
        SyncTask twoGidTask = new SyncTask(chatService, postService, "4761715839862414, 4761715839862415");
        when(chatService.queryGroups()).thenReturn(List.of(
                group(4761715839862414L), group(4761715839862415L)));
        doThrow(new WeiboException("上游失败。"))
                .when(chatService).saveIncremental(4761715839862414L);

        twoGidTask.syncGroupMessages();

        verify(chatService).saveIncremental(4761715839862415L);
    }

    @Test
    void group_message_check_skips_all_when_auto_sync_gids_is_empty() {
        SyncTask emptyTask = new SyncTask(chatService, postService, "");

        emptyTask.syncGroupMessages();

        verify(chatService, org.mockito.Mockito.never()).saveIncremental(org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void group_message_check_supports_multiple_comma_separated_gids() {
        SyncTask multiTask = new SyncTask(chatService, postService, "101, 202");
        when(chatService.queryGroups()).thenReturn(List.of(group(101), group(202), group(303)));

        multiTask.syncGroupMessages();

        verify(chatService).saveIncremental(101);
        verify(chatService).saveIncremental(202);
        verify(chatService, org.mockito.Mockito.never()).saveIncremental(303);
    }

    @Test
    void group_message_check_runs_every_30_seconds() throws NoSuchMethodException {
        Method method = SyncTask.class.getMethod("syncGroupMessages");

        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        assertThat(scheduled).isNotNull();
        assertThat(scheduled.fixedDelay()).isEqualTo(30_000);
        assertThat(scheduled.initialDelay()).isEqualTo(30_000);
        assertThat(WeiboApplication.class).hasAnnotation(EnableScheduling.class);
    }

    @Test
    void blogger_blog_check_incrementally_saves_every_local_blogger() {
        when(postService.queryBloggers()).thenReturn(List.of(blogger(303), blogger(404)));

        syncTask.syncBloggerBlogs();

        verify(postService).saveIncremental(303);
        verify(postService).saveIncremental(404);
    }

    @Test
    void blogger_blog_check_continues_after_one_blogger_fails() {
        when(postService.queryBloggers()).thenReturn(List.of(blogger(303), blogger(404)));
        doThrow(new WeiboException("上游失败。"))
                .when(postService).saveIncremental(303);

        syncTask.syncBloggerBlogs();

        verify(postService).saveIncremental(404);
    }

    @Test
    void blogger_blog_check_runs_every_10_minutes() throws NoSuchMethodException {
        Method method = SyncTask.class.getMethod("syncBloggerBlogs");

        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        assertThat(scheduled).isNotNull();
        assertThat(scheduled.fixedDelay()).isEqualTo(600_000);
        assertThat(scheduled.initialDelay()).isEqualTo(600_000);
    }

    private GroupRecord group(long gid) {
        return new GroupRecord(gid, "", "", 0, 0, 0, List.of(), "", 0);
    }

    private BloggerRecord blogger(long uid) {
        return new BloggerRecord(uid, "", "", "", false);
    }
}
