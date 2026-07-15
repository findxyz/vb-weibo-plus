package xyz.fz.weibo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.repository.GroupRepository;
import xyz.fz.weibo.service.mapper.MessageMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private GroupListApi groupListApi;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private GroupRepository groupRepository;

    private ChatService chatService;

    @BeforeEach
    void setUp() {
        chatService = new ChatService(groupListApi, messageMapper, groupRepository);
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

    private GroupEntity group(long gid, long updatedAt) {
        return new GroupEntity(gid, "群", "", 1, 500, 10, "[]", "", 1,
                0, 0, updatedAt, updatedAt);
    }

    private GroupRecord record(long gid) {
        return new GroupRecord(gid, "群", "", 1, 500, 10, List.of(), "", 1);
    }
}
