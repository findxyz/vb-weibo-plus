package xyz.fz.weibo.service;

import org.springframework.stereotype.Service;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.entity.GroupEntity;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.repository.GroupRepository;
import xyz.fz.weibo.service.mapper.MessageMapper;

import java.util.List;

@Service
public class ChatService {

    private final GroupListApi groupListApi;
    private final MessageMapper messageMapper;
    private final GroupRepository groupRepository;

    public ChatService(GroupListApi groupListApi, MessageMapper messageMapper,
                       GroupRepository groupRepository) {
        this.groupListApi = groupListApi;
        this.messageMapper = messageMapper;
        this.groupRepository = groupRepository;
    }

    public List<GroupRecord> syncGroups() {
        GroupListResponse response = groupListApi.list();
        if (response == null || response.contacts() == null) {
            throw new WeiboException("群列表响应缺少 contacts。", -1);
        }
        List<GroupEntity> groups = messageMapper.toGroupEntities(
                response.contacts(), System.currentTimeMillis());
        groups.forEach(groupRepository::upsertMetadata);
        return queryGroups();
    }

    public List<GroupRecord> queryGroups() {
        return messageMapper.toGroupRecords(groupRepository.findAllOrdered());
    }
}
