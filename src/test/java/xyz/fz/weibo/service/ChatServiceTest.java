package xyz.fz.weibo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.GroupMediaApi;
import xyz.fz.weibo.api.GroupMessagesApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.GroupListView;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageCursorResult;
import xyz.fz.weibo.domain.MessageQueryResult;
import xyz.fz.weibo.domain.MessageRecord;
import xyz.fz.weibo.domain.MessageView;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupSendMessageRequest;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;
import xyz.fz.weibo.model.response.GroupSendMessageResponse;
import xyz.fz.weibo.repository.GroupRepository;
import xyz.fz.weibo.repository.MessageRepository;
import xyz.fz.weibo.service.mapper.MessageMapper;
import xyz.fz.weibo.service.exception.MessageSentButSyncFailedException;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.ResponseExtractor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private GroupListApi groupListApi;

    @Mock
    private GroupMessagesApi groupMessagesApi;

    @Mock
    private GroupMediaApi groupMediaApi;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private GroupRepository groupRepository;

    @Mock
    private MessageRepository messageRepository;

    private ChatService chatService;

    @BeforeEach
    void setUp() {
        chatService = new ChatService(
                groupListApi, groupMessagesApi, groupMediaApi,
                messageMapper, groupRepository, messageRepository, new HeicConverter("ffmpeg"));
    }

    @Test
    void syncs_every_returned_group_and_returns_the_full_ordered_local_list() {
        List<GroupListResponse.Contact> contacts = List.of(
                new GroupListResponse.Contact(null),
                new GroupListResponse.Contact(null)
        );
        GroupListResponse response = new GroupListResponse(2, contacts);
        GroupEntity first = group(1, 100);
        GroupEntity second = group(2, 100);
        List<GroupEntity> localGroups = List.of(second, first);
        List<GroupRecord> records = List.of(record(2), record(1));
        when(groupListApi.list()).thenReturn(response);
        when(messageMapper.toGroupEntities(eq(contacts), anyLong())).thenReturn(List.of(first, second));
        when(groupRepository.findAllOrdered()).thenReturn(localGroups);
        when(messageMapper.toGroupRecords(localGroups)).thenReturn(records);

        List<GroupRecord> result = chatService.syncGroups();

        assertThat(result).isEqualTo(records);
        verify(groupRepository).upsertMetadata(first);
        verify(groupRepository).upsertMetadata(second);
        verify(groupRepository).findAllOrdered();
    }

    @Test
    void queries_groups_from_sqlite_without_calling_the_upstream_api() {
        List<GroupEntity> localGroups = List.of(group(1, 100));
        List<GroupRecord> records = List.of(record(1));
        when(groupRepository.findAllOrdered()).thenReturn(localGroups);
        when(messageMapper.toGroupRecords(localGroups)).thenReturn(records);

        assertThat(chatService.queryGroups()).isEqualTo(records);

        verifyNoInteractions(groupListApi);
    }

    @Test
    void group_list_includes_the_message_at_each_groups_latest_mid() {
        GroupEntity group = new GroupEntity(1L, "群", "", 0, 500, 10, "[]", "", 1,
                50, 100, 1_000, 1_000);
        GroupRecord record = record(1);
        MessageEntity message = messageEntity(100, 2_000);
        MessageRecord messageRecord = messageRecord(100, 0, "", "");
        when(groupRepository.findAllOrdered()).thenReturn(List.of(group));
        when(messageRepository.findAllById(List.of(100L))).thenReturn(List.of(message));
        when(messageMapper.toGroupRecord(group)).thenReturn(record);
        when(messageMapper.toMessageRecord(message)).thenReturn(messageRecord);

        List<GroupListView> result = chatService.queryGroupList();

        assertThat(result).containsExactly(new GroupListView(
                1, "群", "", 1, 500, 10, List.of(), "", 1,
                "发送者", "消息"));
        verifyNoInteractions(groupListApi);
    }

    @Test
    void rejects_missing_contacts_before_mapping_or_writing_any_groups() {
        when(groupListApi.list()).thenReturn(new GroupListResponse(0, null));

        assertThatThrownBy(chatService::syncGroups)
                .isInstanceOf(WeiboException.class)
                .extracting("errorCode")
                .isEqualTo(-1);

        verifyNoInteractions(messageMapper, groupRepository);
    }

    @Test
    void captures_exactly_the_latest_page_when_the_group_has_no_cursor() {
        GroupMessagesResponse.Message inserted = message(100, 321, 1_000);
        GroupMessagesResponse.Message duplicate = message(101, 321, 1_001);
        GroupMessagesResponse.Message filtered = message(102, 332, 1_002);
        MessageEntity insertedEntity = messageEntity(100, 1_000);
        MessageEntity duplicateEntity = messageEntity(101, 1_001);
        when(groupRepository.findMaxMid(1)).thenReturn(0L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(new GroupMessagesResponse(
                        true, List.of(inserted, duplicate, filtered), 1_100));
        when(messageMapper.toMessageEntity(eq(inserted), eq(1L), anyLong()))
                .thenReturn(Optional.of(insertedEntity));
        when(messageMapper.toMessageEntity(eq(duplicate), eq(1L), anyLong()))
                .thenReturn(Optional.of(duplicateEntity));
        when(messageMapper.toMessageEntity(eq(filtered), eq(1L), anyLong()))
                .thenReturn(Optional.empty());
        when(messageRepository.insertIfAbsent(insertedEntity)).thenReturn(true);
        when(messageRepository.insertIfAbsent(duplicateEntity)).thenReturn(false);

        assertThat(chatService.saveIncremental(1)).isEqualTo(new SaveResult(3, 1, 2));

        verify(groupRepository).ensurePlaceholderExists(eq(1L), anyLong());
        verify(messageRepository).refreshGroupRange(1);
        verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, null));
        verifyNoMoreInteractions(groupMessagesApi);
        verifyNoInteractions(groupListApi, groupMediaApi);
    }

    @Test
    void rejects_failed_group_message_response_without_refreshing_the_cursor() {
        when(groupRepository.findMaxMid(1)).thenReturn(0L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(new GroupMessagesResponse(false, null, 1_100))
                .thenReturn(new GroupMessagesResponse(true, null, 1_100));

        assertThatThrownBy(() -> chatService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);
        assertThatThrownBy(() -> chatService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);

        verify(messageRepository, never()).refreshGroupRange(1);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void queries_messages_from_sqlite_with_group_metadata_only_at_the_top_level() {
        GroupEntity group = group(1, 100);
        GroupRecord groupRecord = record(1);
        MessageEntity entity = messageEntity(100, 1_000);
        MessageView view = view(100);
        when(messageRepository.findPage(
                1, 500L, 1_500L, "发送者", "消息", MessageRepository.pageRequest(1, 100)))
                .thenReturn(new PageImpl<>(List.of(entity), MessageRepository.pageRequest(1, 100), 1));
        when(groupRepository.findById(1L)).thenReturn(Optional.of(group));
        when(messageMapper.toGroupRecord(group)).thenReturn(groupRecord);
        when(messageMapper.toMessageViews(List.of(entity))).thenReturn(List.of(view));

        MessageQueryResult result = chatService.queryMessages(
                1, 500L, 1_500L, "发送者", "消息", 1, 100);

        assertThat(result.group()).isEqualTo(groupRecord);
        assertThat(result.items()).containsExactly(view);
        assertThat(result.total()).isEqualTo(1);
        verifyNoInteractions(groupMessagesApi);
    }

    @Test
    void query_messages_returns_gid_only_metadata_and_validates_bounds_and_pagination() {
        GroupRecord placeholder = new GroupRecord(1, "", "", 0, 0, 0, List.of(), "", 0);
        when(messageRepository.findPage(
                1, null, null, null, null, MessageRepository.pageRequest(1, 100)))
                .thenReturn(new PageImpl<>(List.of(), MessageRepository.pageRequest(1, 100), 0));
        when(groupRepository.findById(1L)).thenReturn(Optional.empty());
        when(messageMapper.toEmptyGroupRecord(1)).thenReturn(placeholder);
        when(messageMapper.toMessageViews(List.of())).thenReturn(List.of());

        assertThat(chatService.queryMessages(1, null, null, null, null, 1, 100).group())
                .isEqualTo(placeholder);
        assertThatThrownBy(() -> chatService.queryMessages(
                1, 2_000L, 1_000L, null, null, 1, 100))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessages(
                1, null, null, null, null, 0, 100))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessages(
                1, null, null, null, null, 1, 101))
                .isInstanceOf(InvalidRequestException.class);

        verifyNoInteractions(groupMessagesApi, groupMediaApi);
    }

    @Test
    void queries_messages_with_a_stable_composite_cursor_and_reports_the_next_cursor() {
        GroupEntity group = group(1, 100);
        GroupRecord groupRecord = record(1);
        MessageEntity newest = messageEntity(103, 4_000);
        MessageEntity next = messageEntity(102, 3_000);
        MessageEntity lookahead = messageEntity(101, 2_000);
        List<MessageView> views = List.of(view(103), view(102));
        when(messageRepository.findCursorPage(
                1, null, null, PageRequest.of(0, 3)))
                .thenReturn(List.of(newest, next, lookahead));
        when(groupRepository.findById(1L)).thenReturn(Optional.of(group));
        when(messageMapper.toGroupRecord(group)).thenReturn(groupRecord);
        when(messageMapper.toMessageViews(List.of(newest, next))).thenReturn(views);

        MessageCursorResult result = chatService.queryMessagesByCursor(
                1, null, null, null, null, 2);

        assertThat(result.group()).isEqualTo(groupRecord);
        assertThat(result.items()).containsExactlyElementsOf(views);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.nextBeforeCreatedAt()).isEqualTo(3_000);
        assertThat(result.nextBeforeMid()).isEqualTo(102);
        assertThat(result.nextAfterCreatedAt()).isNull();
        assertThat(result.nextAfterMid()).isNull();
    }

    @Test
    void queries_newer_messages_from_the_after_cursor_and_keeps_descending_response_order() {
        GroupEntity group = group(1, 100);
        GroupRecord groupRecord = record(1);
        MessageEntity nearest = messageEntity(102, 3_000);
        MessageEntity newer = messageEntity(103, 4_000);
        MessageEntity lookahead = messageEntity(104, 5_000);
        List<MessageView> views = List.of(view(103), view(102));
        when(messageRepository.findAfterCursorPage(
                1, 2_000L, 101L, PageRequest.of(0, 3)))
                .thenReturn(List.of(nearest, newer, lookahead));
        when(groupRepository.findById(1L)).thenReturn(Optional.of(group));
        when(messageMapper.toGroupRecord(group)).thenReturn(groupRecord);
        when(messageMapper.toMessageViews(List.of(newer, nearest))).thenReturn(views);

        MessageCursorResult result = chatService.queryMessagesByCursor(
                1, null, null, 2_000L, 101L, 2);

        assertThat(result.group()).isEqualTo(groupRecord);
        assertThat(result.items()).containsExactlyElementsOf(views);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.nextBeforeCreatedAt()).isNull();
        assertThat(result.nextBeforeMid()).isNull();
        assertThat(result.nextAfterCreatedAt()).isEqualTo(4_000);
        assertThat(result.nextAfterMid()).isEqualTo(103);
    }

    @Test
    void cursor_query_requires_a_complete_cursor_and_valid_size() {
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, 1_000L, null, null, null, 50))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, null, 100L, null, null, 50))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, null, null, 1_000L, null, 50))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, null, null, null, 100L, 50))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, 1_000L, 100L, 2_000L, 200L, 50))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessagesByCursor(
                1, null, null, null, null, 101))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void catches_up_multiple_pages_using_the_oldest_mid_and_stops_at_the_fixed_boundary() {
        when(groupRepository.findMaxMid(1)).thenReturn(100L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(120, 321, 1_020), message(130, 321, 1_030)));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 120L)))
                .thenReturn(messagePage(
                        message(90, 321, 990), message(100, 321, 1_000), message(110, 321, 1_010)));
        mapEveryMessage();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        assertThat(chatService.saveIncremental(1)).isEqualTo(new SaveResult(5, 3, 2));

        ArgumentCaptor<MessageEntity> saved = ArgumentCaptor.forClass(MessageEntity.class);
        verify(messageRepository, times(3)).insertIfAbsent(saved.capture());
        assertThat(saved.getAllValues()).extracting(MessageEntity::getMid)
                .containsExactly(130L, 120L, 110L);
        verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, 120L));
        verifyNoMoreInteractions(groupMessagesApi);
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void successful_empty_page_stops_incremental_catch_up_and_refreshes_the_range() {
        when(groupRepository.findMaxMid(1)).thenReturn(100L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(110, 321, 1_010), message(120, 321, 1_020)));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenReturn(messagePage());
        mapEveryMessage();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        assertThat(chatService.saveIncremental(1)).isEqualTo(new SaveResult(2, 2, 0));

        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void paging_failure_preserves_captured_messages_and_the_old_group_cursor() {
        when(groupRepository.findMaxMid(1)).thenReturn(100L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(110, 321, 1_010), message(120, 321, 1_020)));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenThrow(new WeiboException("上游分页失败。", -1));
        mapEveryMessage();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        assertThatThrownBy(() -> chatService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);

        verify(messageRepository, times(2)).insertIfAbsent(any());
        verify(messageRepository, never()).refreshGroupRange(1);
    }

    @Test
    void repository_failure_preserves_earlier_messages_and_the_old_group_cursor() {
        when(groupRepository.findMaxMid(1)).thenReturn(100L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(110, 321, 1_010), message(120, 321, 1_020)));
        mapEveryMessage();
        when(messageRepository.insertIfAbsent(any()))
                .thenReturn(true)
                .thenThrow(new IllegalStateException("Database write failed"));

        assertThatThrownBy(() -> chatService.saveIncremental(1))
                .isInstanceOf(IllegalStateException.class);

        verify(messageRepository, times(2)).insertIfAbsent(any());
        verify(messageRepository, never()).refreshGroupRange(1);
    }

    @Test
    void retry_ignores_earlier_captures_and_fills_the_remaining_incremental_gap() {
        GroupMessagesResponse firstPage = messagePage(
                message(120, 321, 1_020), message(130, 321, 1_030));
        GroupMessagesResponse boundaryPage = messagePage(
                message(90, 321, 990), message(100, 321, 1_000), message(110, 321, 1_010));
        when(groupRepository.findMaxMid(1)).thenReturn(100L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(firstPage);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 120L)))
                .thenThrow(new WeiboException("上游分页失败。", -1))
                .thenReturn(boundaryPage);
        mapEveryMessage();
        when(messageRepository.insertIfAbsent(any()))
                .thenReturn(true, true, false, false, true);

        assertThatThrownBy(() -> chatService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);
        assertThat(chatService.saveIncremental(1)).isEqualTo(new SaveResult(5, 1, 4));

        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfill_from_newest_includes_the_exact_time_boundary_across_pages() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(110, 321, 1_001), message(120, 321, 1_002)));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenReturn(messagePage(message(90, 321, 999), message(100, 321, 1_000)));
        mapEveryMessageWithTime();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        chatService.saveBySince(1, 1_000, null);

        ArgumentCaptor<MessageEntity> saved = ArgumentCaptor.forClass(MessageEntity.class);
        verify(messageRepository, times(3)).insertIfAbsent(saved.capture());
        assertThat(saved.getAllValues()).extracting(MessageEntity::getMid)
                .containsExactly(120L, 110L, 100L);
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfill_waits_between_page_fetches() {
        AtomicLong firstFetch = new AtomicLong();
        AtomicLong secondFetch = new AtomicLong();
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenAnswer(invocation -> {
                    firstFetch.set(System.nanoTime());
                    return messagePage(message(110, 321, 1_100));
                });
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenAnswer(invocation -> {
                    secondFetch.set(System.nanoTime());
                    return messagePage();
                });
        mapEveryMessageWithTime();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        chatService.saveBySince(1, 900, null);

        long delayMillis = TimeUnit.NANOSECONDS.toMillis(secondFetch.get() - firstFetch.get());
        assertThat(delayMillis).isBetween(200L, 3_000L);
    }

    @Test
    void concurrent_backfill_returns_immediately_and_failure_releases_the_lock() throws Exception {
        CountDownLatch firstFetchStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstFetch = new CountDownLatch(1);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenAnswer(invocation -> {
                    firstFetchStarted.countDown();
                    releaseFirstFetch.await(5, TimeUnit.SECONDS);
                    throw new WeiboException("上游分页失败。", -1);
                })
                .thenReturn(messagePage());
        ExecutorService executor = Executors.newSingleThreadExecutor();

        try {
            Future<?> firstRequest = executor.submit(
                    () -> chatService.saveBySince(1, 900, null));
            assertThat(firstFetchStarted.await(5, TimeUnit.SECONDS)).isTrue();

            long startedAt = System.nanoTime();
            chatService.saveBySince(1, 900, null);
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt))
                    .isLessThan(200);
            verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, null));

            releaseFirstFetch.countDown();
            assertThatThrownBy(() -> firstRequest.get(5, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(WeiboException.class);

            chatService.saveBySince(1, 900, null);
            verify(groupMessagesApi, times(2))
                    .messages(new GroupMessagesRequest(1L, null));
        } finally {
            releaseFirstFetch.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void backfill_uses_the_explicit_starting_mid_without_choosing_another_cursor() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 50L)))
                .thenReturn(messagePage());

        chatService.saveBySince(1, 1_000, 50L);

        verify(groupRepository, never()).findMaxMid(anyLong());
        verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, 50L));
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfill_failure_keeps_earlier_captures_and_retry_fills_the_gap_idempotently() {
        GroupMessagesResponse firstPage = messagePage(
                message(110, 321, 1_001), message(120, 321, 1_002));
        GroupMessagesResponse secondPage = messagePage(message(100, 321, 1_000));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(firstPage);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenThrow(new WeiboException("上游分页失败。", -1))
                .thenReturn(secondPage);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 100L)))
                .thenReturn(messagePage());
        mapEveryMessageWithTime();
        when(messageRepository.insertIfAbsent(any()))
                .thenReturn(true, true, false, false, true);

        assertThatThrownBy(() -> chatService.saveBySince(1, 1_000, null))
                .isInstanceOf(WeiboException.class);
        verify(messageRepository, never()).refreshGroupRange(1);

        chatService.saveBySince(1, 1_000, null);
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfill_business_failure_never_refreshes_the_group_range() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(new GroupMessagesResponse(false, List.of(), 1_100));

        assertThatThrownBy(() -> chatService.saveBySince(1, 1_000, null))
                .isInstanceOf(WeiboException.class);

        verify(messageRepository, never()).refreshGroupRange(1);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void proxies_image_preview_and_original_from_the_saved_string_fid() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 1, "5302496155143676_file", "");
        ResponseEntity<byte[]> previewResponse = ResponseEntity.ok(new byte[]{1});
        ResponseEntity<byte[]> originalResponse = ResponseEntity.ok(new byte[]{2});
        MediaBinary preview = new MediaBinary(new byte[]{1}, "image/jpeg");
        MediaBinary original = new MediaBinary(new byte[]{2}, "image/jpeg");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(groupMediaApi.download(new GroupMediaRequest(
                "5302496155143676_file", "compress"))).thenReturn(previewResponse);
        when(groupMediaApi.download(new GroupMediaRequest(
                "5302496155143676_file", "origin"))).thenReturn(originalResponse);
        when(messageMapper.toMediaBinary(previewResponse)).thenReturn(preview);
        when(messageMapper.toMediaBinary(originalResponse)).thenReturn(original);

        assertThat(chatService.queryMessageMedia(1, 100, "preview")).isEqualTo(preview);
        assertThat(chatService.queryMessageMedia(1, 100, "original")).isEqualTo(original);
    }

    @Test
    void proxies_only_the_saved_video_cover_and_rejects_video_original() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 10, "video-file", "video-cover");
        ResponseEntity<byte[]> response = ResponseEntity.ok(new byte[]{1});
        MediaBinary cover = new MediaBinary(new byte[]{1}, "image/jpeg");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(messageMapper.isVideo(record)).thenReturn(true);
        when(groupMediaApi.download(new GroupMediaRequest("video-cover", null)))
                .thenReturn(response);
        when(messageMapper.toMediaBinary(response)).thenReturn(cover);

        assertThat(chatService.queryMessageMedia(1, 100, "preview")).isEqualTo(cover);
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 100, "original"))
                .isInstanceOf(InvalidRequestException.class);

        verify(groupMediaApi).download(new GroupMediaRequest("video-cover", null));
        verify(groupMediaApi, never()).download(new GroupMediaRequest("video-file", null));
    }

    @Test
    void proxies_the_saved_cover_for_non_red_packet_media_type_13() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 13, "video-file", "video-cover");
        ResponseEntity<byte[]> response = ResponseEntity.ok(new byte[]{1});
        MediaBinary cover = new MediaBinary(new byte[]{1}, "image/jpeg");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(messageMapper.isVideo(record)).thenReturn(true);
        when(groupMediaApi.download(new GroupMediaRequest("video-cover", null)))
                .thenReturn(response);
        when(messageMapper.toMediaBinary(response)).thenReturn(cover);

        assertThat(chatService.queryMessageMedia(1, 100, "preview")).isEqualTo(cover);
    }

    @Test
    void streams_the_full_video_from_the_saved_message_reference() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 10, "video-file", "video-cover");
        GroupMediaRequest request = new GroupMediaRequest("video-file", null);
        MockClientHttpResponse upstream = new MockClientHttpResponse(
                new byte[]{1, 2, 3}, HttpStatus.OK);
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(messageMapper.isVideo(record)).thenReturn(true);
        when(groupMediaApi.stream(eq(request), any(HttpHeaders.class), any()))
                .thenAnswer(invocation -> {
                    ResponseExtractor<String> extractor = invocation.getArgument(2);
                    return extractor.extractData(upstream);
                });

        String result = chatService.streamMessageVideo(
                1, 100, response -> new String(response.getBody().readAllBytes()));

        assertThat(result).isEqualTo("\u0001\u0002\u0003");
    }

    @Test
    void video_stream_exposes_an_upstream_range_not_satisfiable_response() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 10, "video-file", "");
        GroupMediaRequest request = new GroupMediaRequest("video-file", null);
        MockClientHttpResponse upstream = new MockClientHttpResponse(
                new byte[0], HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
        upstream.getHeaders().set(HttpHeaders.CONTENT_RANGE, "bytes */4");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(messageMapper.isVideo(record)).thenReturn(true);
        when(groupMediaApi.stream(eq(request), any(HttpHeaders.class), any()))
                .thenAnswer(invocation -> {
                    ResponseExtractor<Integer> extractor = invocation.getArgument(2);
                    return extractor.extractData(upstream);
                });

        int status = chatService.streamMessageVideo(
                1, 100, new HttpHeaders(), response -> response.getStatusCode().value());

        assertThat(status).isEqualTo(416);
    }

    @Test
    void video_stream_rejects_invalid_local_messages_before_calling_upstream() {
        when(messageRepository.findById(100L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 100, response -> null))
                .isInstanceOf(ResourceNotFoundException.class);

        MessageEntity mismatched = messageEntity(101, 1_000);
        MessageRecord mismatchedRecord = messageRecord(101, 10, "video-file", "");
        when(messageRepository.findById(101L)).thenReturn(Optional.of(mismatched));
        when(messageMapper.toMessageRecord(mismatched)).thenReturn(mismatchedRecord);
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                2, 101, response -> null))
                .isInstanceOf(ResourceNotFoundException.class);

        MessageEntity nonVideo = messageEntity(102, 1_000);
        MessageRecord nonVideoRecord = messageRecord(102, 1, "image-file", "");
        when(messageRepository.findById(102L)).thenReturn(Optional.of(nonVideo));
        when(messageMapper.toMessageRecord(nonVideo)).thenReturn(nonVideoRecord);
        when(messageMapper.isVideo(nonVideoRecord)).thenReturn(false);
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 102, response -> null))
                .isInstanceOf(InvalidRequestException.class);

        MessageEntity missingReference = messageEntity(103, 1_000);
        MessageRecord missingReferenceRecord = messageRecord(103, 10, "", "");
        when(messageRepository.findById(103L)).thenReturn(Optional.of(missingReference));
        when(messageMapper.toMessageRecord(missingReference)).thenReturn(missingReferenceRecord);
        when(messageMapper.isVideo(missingReferenceRecord)).thenReturn(true);
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 103, response -> null))
                .isInstanceOf(ResourceNotFoundException.class);

        verifyNoInteractions(groupMediaApi);
    }

    @Test
    void video_stream_maps_upstream_failure_and_preserves_credential_errors() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 10, "video-file", "");
        GroupMediaRequest request = new GroupMediaRequest("video-file", null);
        MockClientHttpResponse notFound = new MockClientHttpResponse(
                new byte[0], HttpStatus.NOT_FOUND);
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(messageMapper.isVideo(record)).thenReturn(true);
        when(groupMediaApi.stream(eq(request), any(HttpHeaders.class), any()))
                .thenAnswer(invocation -> {
                    ResponseExtractor<Void> extractor = invocation.getArgument(2);
                    return extractor.extractData(notFound);
                })
                .thenThrow(new WeiboCookieExpiredException("Credential 失效。"))
                .thenThrow(new WeiboRateLimitException("限流。"));

        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 100, response -> null))
                .isInstanceOfSatisfying(WeiboException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(-1));
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 100, response -> null))
                .isInstanceOf(WeiboCookieExpiredException.class);
        assertThatThrownBy(() -> chatService.streamMessageVideo(
                1, 100, response -> null))
                .isInstanceOf(WeiboRateLimitException.class);
    }

    @Test
    void rejects_missing_mismatched_and_unsupported_local_media() {
        when(messageRepository.findById(100L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 100, "preview"))
                .isInstanceOf(ResourceNotFoundException.class);

        MessageEntity entity = messageEntity(101, 1_000);
        when(messageRepository.findById(101L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity))
                .thenReturn(messageRecord(101, 0, "", "stray-cover"));
        assertThatThrownBy(() -> chatService.queryMessageMedia(2, 101, "preview"))
                .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 101, "preview"))
                .isInstanceOf(InvalidRequestException.class);

        MessageEntity missingImage = messageEntity(102, 1_000);
        when(messageRepository.findById(102L)).thenReturn(Optional.of(missingImage));
        when(messageMapper.toMessageRecord(missingImage))
                .thenReturn(messageRecord(102, 1, "", ""));
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 102, "preview"))
                .isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(groupMediaApi);
    }

    @Test
    void maps_upstream_media_failure_to_bad_gateway_and_preserves_credential_and_rate_limit_errors() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 1, "image-fid", "");
        GroupMediaRequest request = new GroupMediaRequest("image-fid", "compress");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
        when(groupMediaApi.download(request))
                .thenReturn(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new byte[0]))
                .thenThrow(new WeiboCookieExpiredException("Credential 失效。"))
                .thenThrow(new WeiboRateLimitException("限流。"));

        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 100, "preview"))
                .isInstanceOfSatisfying(WeiboException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(-1));
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 100, "preview"))
                .isInstanceOf(WeiboCookieExpiredException.class);
        assertThatThrownBy(() -> chatService.queryMessageMedia(1, 100, "preview"))
                .isInstanceOf(WeiboRateLimitException.class);
    }

    @Test
    void send_text_posts_to_weibo_then_triggers_incremental_capture_and_returns_success() {
        GroupSendMessageRequest request = new GroupSendMessageRequest(1L, "hello");
        when(groupMessagesApi.send(request))
                .thenReturn(new GroupSendMessageResponse(true, 100L, 1L, "hello", null, 1_000L, 1_000L));
        when(groupRepository.findMaxMid(1)).thenReturn(99L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage());

        SaveResult result = chatService.sendText(1, "hello");

        assertThat(result).isEqualTo(new SaveResult(0, 0, 0));
        verify(groupMessagesApi).send(request);
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void send_text_rejects_blank_content_before_calling_weibo() {
        assertThatThrownBy(() -> chatService.sendText(1, "   "))
                .isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(groupMessagesApi);
    }

    @Test
    void send_text_propagates_weibo_send_failure_without_triggering_capture() {
        GroupSendMessageRequest request = new GroupSendMessageRequest(1L, "hello");
        when(groupMessagesApi.send(request))
                .thenReturn(new GroupSendMessageResponse(false, null, 1L, null, null, null, null));

        assertThatThrownBy(() -> chatService.sendText(1, "hello"))
                .isInstanceOf(WeiboException.class);

        verify(groupMessagesApi, never()).messages(any());
        verify(messageRepository, never()).refreshGroupRange(anyLong());
    }

    @Test
    void send_text_reports_sync_failure_when_capture_fails_after_a_successful_send() {
        GroupSendMessageRequest request = new GroupSendMessageRequest(1L, "hello");
        when(groupMessagesApi.send(request))
                .thenReturn(new GroupSendMessageResponse(true, 100L, 1L, "hello", null, 1_000L, 1_000L));
        when(groupRepository.findMaxMid(1)).thenReturn(99L);
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenThrow(new WeiboException("增量拉取失败。", -1));

        assertThatThrownBy(() -> chatService.sendText(1, "hello"))
                .isInstanceOf(MessageSentButSyncFailedException.class)
                .hasMessageContaining("已发出");
    }

    @Test
    void downloads_a_file_message_by_fid_via_the_local_message() {
        MessageEntity file = new MessageEntity(500L, 1, 321, "普通消息", 5, 9, "发送者", "",
                "海外即插即充流程.md", "file-fid", "", "", "[]", "[]", "", "{}", "[]", "", 1_000, 2_000);
        when(messageRepository.findById(500L)).thenReturn(Optional.of(file));
        when(messageMapper.toMessageRecord(file)).thenReturn(messageRecord(500, 5, "file-fid", ""));
        ResponseEntity<byte[]> upstream = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/octet-stream")
                .body(new byte[]{1, 2, 3});
        when(groupMediaApi.download(new GroupMediaRequest("file-fid", null))).thenReturn(upstream);
        when(messageMapper.toMediaBinary(upstream))
                .thenReturn(new MediaBinary(new byte[]{1, 2, 3}, "application/octet-stream"));

        MediaBinary result = chatService.downloadMessageFile(1, 500L);

        assertThat(result.content()).containsExactly(1, 2, 3);
        assertThat(result.contentType()).isEqualTo("application/octet-stream");
    }

    @Test
    void rejects_file_download_for_a_non_file_message() {
        MessageEntity image = new MessageEntity(500L, 1, 321, "普通消息", 1, 9, "发送者", "",
                "图片", "image-fid", "", "", "[]", "[]", "", "{}", "[]", "", 1_000, 2_000);
        when(messageRepository.findById(500L)).thenReturn(Optional.of(image));
        when(messageMapper.toMessageRecord(image)).thenReturn(messageRecord(500, 1, "image-fid", ""));

        assertThatThrownBy(() -> chatService.downloadMessageFile(1, 500L))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("不是文件消息");
    }

    private GroupEntity group(long gid, long updatedAt) {
        return new GroupEntity(gid, "群", "", 1, 500, 10, "[]", "", 1,
                0, 0, updatedAt, updatedAt);
    }

    private GroupRecord record(long gid) {
        return new GroupRecord(gid, "群", "", 1, 500, 10, List.of(), "", 1);
    }

    private GroupMessagesResponse.Message message(long mid, int type, long time) {
        return new GroupMessagesResponse.Message(mid, 1L, type, 9L, null, "消息", 0, time,
                List.of(), null, null, null, null, null, "", null, null, null, "");
    }

    private MessageEntity messageEntity(long mid, long createdAt) {
        return new MessageEntity(mid, 1, 321, "普通消息", 0, 9, "发送者", "", "消息",
                "", "", "", "[]", "[]", "", "{}", "[]", "", createdAt, 2_000);
    }

    private MessageView view(long mid) {
        return new MessageView(mid, 1, 321, "普通消息", 0, 9, "发送者", "", "消息",
                List.of(), List.of(), "", Map.of(), List.of(), "", 1_000, 2_000, "", "", "", "");
    }

    private MessageRecord messageRecord(long mid, int mediaType, String fid, String coverFid) {
        return new MessageRecord(mid, 1, 321, "普通消息", mediaType, 9, "发送者", "", "消息",
                fid, coverFid, "", List.of(), List.of(), "", Map.of(), List.of(), "",
                1_000, 2_000);
    }

    private GroupMessagesResponse messagePage(GroupMessagesResponse.Message... messages) {
        return new GroupMessagesResponse(true, List.of(messages), 1_100);
    }

    private void mapEveryMessage() {
        when(messageMapper.toMessageEntity(any(), eq(1L), anyLong()))
                .thenAnswer(invocation -> {
                    GroupMessagesResponse.Message message = invocation.getArgument(0);
                    return Optional.of(messageEntity(message.id(), message.time()));
                });
    }

    private void mapEveryMessageWithTime() {
        mapEveryMessage();
        when(messageMapper.toMessageTimestamp(any()))
                .thenAnswer(invocation -> {
                    GroupMessagesResponse.Message message = invocation.getArgument(0);
                    return message.time();
                });
    }
}
