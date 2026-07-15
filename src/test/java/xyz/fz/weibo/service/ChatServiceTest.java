package xyz.fz.weibo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.GroupMediaApi;
import xyz.fz.weibo.api.GroupMessagesApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.MessageQueryResult;
import xyz.fz.weibo.domain.MessageRecord;
import xyz.fz.weibo.domain.MessageView;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.entity.MessageEntity;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;
import xyz.fz.weibo.repository.GroupRepository;
import xyz.fz.weibo.repository.MessageRepository;
import xyz.fz.weibo.service.mapper.MessageMapper;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.PageImpl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

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
                messageMapper, groupRepository, messageRepository);
    }

    @Test
    void syncsEveryReturnedGroupAndReturnsTheFullOrderedLocalList() {
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
    void queriesGroupsFromSQLiteWithoutCallingTheUpstreamApi() {
        List<GroupEntity> localGroups = List.of(group(1, 100));
        List<GroupRecord> records = List.of(record(1));
        when(groupRepository.findAllOrdered()).thenReturn(localGroups);
        when(messageMapper.toGroupRecords(localGroups)).thenReturn(records);

        assertThat(chatService.queryGroups()).isEqualTo(records);

        verifyNoInteractions(groupListApi);
    }

    @Test
    void rejectsMissingContactsBeforeMappingOrWritingAnyGroups() {
        when(groupListApi.list()).thenReturn(new GroupListResponse(0, null));

        assertThatThrownBy(chatService::syncGroups)
                .isInstanceOf(WeiboException.class)
                .extracting("errorCode")
                .isEqualTo(-1);

        verifyNoInteractions(messageMapper, groupRepository);
    }

    @Test
    void capturesExactlyTheLatestPageWhenTheGroupHasNoCursor() {
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

        verify(groupRepository).findOrCreatePlaceholder(eq(1L), anyLong());
        verify(messageRepository).refreshGroupRange(1);
        verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, null));
        verifyNoMoreInteractions(groupMessagesApi);
        verifyNoInteractions(groupListApi, groupMediaApi);
    }

    @Test
    void rejectsFailedGroupMessageResponseWithoutRefreshingTheCursor() {
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
    void queriesMessagesFromSQLiteWithGroupMetadataOnlyAtTheTopLevel() {
        GroupEntity group = group(1, 100);
        GroupRecord groupRecord = record(1);
        MessageEntity entity = messageEntity(100, 1_000);
        MessageView view = view(100);
        when(messageRepository.findPage(
                1, 500L, 1_500L, MessageRepository.pageRequest(1, 100)))
                .thenReturn(new PageImpl<>(List.of(entity), MessageRepository.pageRequest(1, 100), 1));
        when(groupRepository.findById(1L)).thenReturn(Optional.of(group));
        when(messageMapper.toGroupRecord(group)).thenReturn(groupRecord);
        when(messageMapper.toMessageViews(List.of(entity))).thenReturn(List.of(view));

        MessageQueryResult result = chatService.queryMessages(1, 500L, 1_500L, 1, 100);

        assertThat(result.group()).isEqualTo(groupRecord);
        assertThat(result.items()).containsExactly(view);
        assertThat(result.total()).isEqualTo(1);
        verifyNoInteractions(groupMessagesApi);
    }

    @Test
    void queryMessagesReturnsGidOnlyMetadataAndValidatesBoundsAndPagination() {
        GroupRecord placeholder = new GroupRecord(1, "", "", 0, 0, 0, List.of(), "", 0);
        when(messageRepository.findPage(
                1, null, null, MessageRepository.pageRequest(1, 100)))
                .thenReturn(new PageImpl<>(List.of(), MessageRepository.pageRequest(1, 100), 0));
        when(groupRepository.findById(1L)).thenReturn(Optional.empty());
        when(messageMapper.toEmptyGroupRecord(1)).thenReturn(placeholder);
        when(messageMapper.toMessageViews(List.of())).thenReturn(List.of());

        assertThat(chatService.queryMessages(1, null, null, 1, 100).group())
                .isEqualTo(placeholder);
        assertThatThrownBy(() -> chatService.queryMessages(1, 2_000L, 1_000L, 1, 100))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessages(1, null, null, 0, 100))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> chatService.queryMessages(1, null, null, 1, 101))
                .isInstanceOf(InvalidRequestException.class);

        verifyNoInteractions(groupMessagesApi, groupMediaApi);
    }

    @Test
    void catchesUpMultiplePagesUsingTheOldestMidAndStopsAtTheFixedBoundary() {
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
    void successfulEmptyPageStopsIncrementalCatchUpAndRefreshesTheRange() {
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
    void pagingFailurePreservesCapturedMessagesAndTheOldGroupCursor() {
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
    void repositoryFailurePreservesEarlierMessagesAndTheOldGroupCursor() {
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
    void retryIgnoresEarlierCapturesAndFillsTheRemainingIncrementalGap() {
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
    void backfillFromNewestIncludesTheExactTimeBoundaryAcrossPages() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(messagePage(message(110, 321, 1_001), message(120, 321, 1_002)));
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 110L)))
                .thenReturn(messagePage(message(90, 321, 999), message(100, 321, 1_000)));
        mapEveryMessageWithTime();
        when(messageRepository.insertIfAbsent(any())).thenReturn(true);

        assertThat(chatService.saveBySince(1, 1_000, null))
                .isEqualTo(new SaveResult(4, 3, 1));

        ArgumentCaptor<MessageEntity> saved = ArgumentCaptor.forClass(MessageEntity.class);
        verify(messageRepository, times(3)).insertIfAbsent(saved.capture());
        assertThat(saved.getAllValues()).extracting(MessageEntity::getMid)
                .containsExactly(120L, 110L, 100L);
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfillUsesTheExplicitStartingMidWithoutChoosingAnotherCursor() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, 50L)))
                .thenReturn(messagePage());

        assertThat(chatService.saveBySince(1, 1_000, 50L))
                .isEqualTo(new SaveResult(0, 0, 0));

        verify(groupRepository, never()).findMaxMid(anyLong());
        verify(groupMessagesApi).messages(new GroupMessagesRequest(1L, 50L));
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfillFailureKeepsEarlierCapturesAndRetryFillsTheGapIdempotently() {
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

        assertThat(chatService.saveBySince(1, 1_000, null))
                .isEqualTo(new SaveResult(3, 1, 2));
        verify(messageRepository).refreshGroupRange(1);
    }

    @Test
    void backfillBusinessFailureNeverRefreshesTheGroupRange() {
        when(groupMessagesApi.messages(new GroupMessagesRequest(1L, null)))
                .thenReturn(new GroupMessagesResponse(false, List.of(), 1_100));

        assertThatThrownBy(() -> chatService.saveBySince(1, 1_000, null))
                .isInstanceOf(WeiboException.class);

        verify(messageRepository, never()).refreshGroupRange(1);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void proxiesImagePreviewAndOriginalFromTheSavedStringFid() {
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
    void proxiesOnlyTheSavedVideoCoverAndRejectsVideoOriginal() {
        MessageEntity entity = messageEntity(100, 1_000);
        MessageRecord record = messageRecord(100, 10, "video-file", "video-cover");
        ResponseEntity<byte[]> response = ResponseEntity.ok(new byte[]{1});
        MediaBinary cover = new MediaBinary(new byte[]{1}, "image/jpeg");
        when(messageRepository.findById(100L)).thenReturn(Optional.of(entity));
        when(messageMapper.toMessageRecord(entity)).thenReturn(record);
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
    void rejectsMissingMismatchedAndUnsupportedLocalMedia() {
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
    void mapsUpstreamMediaFailureToBadGatewayAndPreservesCredentialAndRateLimitErrors() {
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
        return new MessageEntity(mid, 1, 321, "普通消息", 0, 9, "发送者", "消息",
                "", "", "", "[]", "[]", "", "{}", "[]", "", createdAt, 2_000);
    }

    private MessageView view(long mid) {
        return new MessageView(mid, 1, 321, "普通消息", 0, 9, "发送者", "消息",
                List.of(), List.of(), "", Map.of(), List.of(), "", 1_000, 2_000, "", "");
    }

    private MessageRecord messageRecord(long mid, int mediaType, String fid, String coverFid) {
        return new MessageRecord(mid, 1, 321, "普通消息", mediaType, 9, "发送者", "消息",
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
