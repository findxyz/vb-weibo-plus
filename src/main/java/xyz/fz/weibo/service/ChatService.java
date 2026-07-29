package xyz.fz.weibo.service;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResponseExtractor;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.GroupMediaApi;
import xyz.fz.weibo.api.GroupMessagesApi;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.GroupListView;
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
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;
import xyz.fz.weibo.service.mapper.MessageMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Predicate;

@Service
public class ChatService {

    private final GroupListApi groupListApi;
    private final GroupMessagesApi groupMessagesApi;
    private final GroupMediaApi groupMediaApi;
    private final MessageMapper messageMapper;
    private final GroupRepository groupRepository;
    private final MessageRepository messageRepository;
    private final ReentrantLock saveBySinceLock = new ReentrantLock();

    public ChatService(GroupListApi groupListApi, GroupMessagesApi groupMessagesApi,
                       GroupMediaApi groupMediaApi, MessageMapper messageMapper,
                       GroupRepository groupRepository, MessageRepository messageRepository) {
        this.groupListApi = groupListApi;
        this.groupMessagesApi = groupMessagesApi;
        this.groupMediaApi = groupMediaApi;
        this.messageMapper = messageMapper;
        this.groupRepository = groupRepository;
        this.messageRepository = messageRepository;
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

    public List<GroupListView> queryGroupList() {
        List<GroupEntity> groups = groupRepository.findAllOrdered();
        List<Long> latestMids = groups.stream()
                .map(GroupEntity::getMaxMid)
                .filter(mid -> mid > 0)
                .distinct()
                .toList();
        Map<Long, MessageRecord> latestMessages = new HashMap<>();
        if (!latestMids.isEmpty()) {
            messageRepository.findAllById(latestMids).stream()
                    .map(messageMapper::toMessageRecord)
                    .forEach(message -> latestMessages.put(message.mid(), message));
        }
        return groups.stream()
                .map(group -> toGroupListView(group, latestMessages.get(group.getMaxMid())))
                .toList();
    }

    public SaveResult saveIncremental(long gid) {
        validateGid(gid);
        long capturedAt = System.currentTimeMillis();
        groupRepository.ensurePlaceholderExists(gid, capturedAt);
        long boundaryMid = groupRepository.findMaxMid(gid);
        Long beforeMid = null;
        int fetched = 0;
        int inserted = 0;
        int ignored = 0;
        while (true) {
            List<GroupMessagesResponse.Message> messages = requireMessages(
                    groupMessagesApi.messages(new GroupMessagesRequest(gid, beforeMid)));
            if (messages.isEmpty()) {
                break;
            }
            fetched += messages.size();
            PageCapture capture = capturePage(messages, gid, capturedAt,
                    message -> boundaryMid > 0 && requireMid(message) <= boundaryMid);
            inserted += capture.inserted();
            ignored += capture.ignored();
            if (boundaryMid == 0 || capture.reachedBoundary()) {
                break;
            }
            beforeMid = requireMid(messages.getFirst());
        }
        messageRepository.refreshGroupRange(gid);
        return new SaveResult(fetched, inserted, ignored);
    }

    public MessageQueryResult queryMessages(long gid, Long start, Long end,
                                            String senderName, String keyword,
                                            int page, int size) {
        validateGid(gid);
        validateQuery(start, end, page, size);
        Page<MessageEntity> result = messageRepository.findPage(
                gid, start, end, senderName, keyword, MessageRepository.pageRequest(page, size));
        GroupRecord group = groupRepository.findById(gid)
                .map(messageMapper::toGroupRecord)
                .orElseGet(() -> messageMapper.toEmptyGroupRecord(gid));
        List<MessageView> items = messageMapper.toMessageViews(result.getContent());
        return new MessageQueryResult(group, items, page, size, result.getTotalElements());
    }

    public SaveResult saveBySince(long gid, long sinceTime, Long beforeMid) {
        if (!saveBySinceLock.tryLock()) {
            return new SaveResult(0, 0, 0);
        }
        try {
            validateGid(gid);
            long capturedAt = System.currentTimeMillis();
            groupRepository.ensurePlaceholderExists(gid, capturedAt);
            Long cursor = beforeMid;
            int fetched = 0;
            int inserted = 0;
            int ignored = 0;
            while (true) {
                List<GroupMessagesResponse.Message> messages = requireMessages(
                        groupMessagesApi.messages(new GroupMessagesRequest(gid, cursor)));
                if (messages.isEmpty()) {
                    break;
                }
                fetched += messages.size();
                PageCapture capture = capturePage(messages, gid, capturedAt,
                        message -> messageMapper.toMessageTimestamp(message) < sinceTime);
                inserted += capture.inserted();
                ignored += capture.ignored();
                if (capture.reachedBoundary()) {
                    break;
                }
                cursor = requireMid(messages.getFirst());
                sleep(ThreadLocalRandom.current().nextLong(200, 2_001));
            }
            messageRepository.refreshGroupRange(gid);
            return new SaveResult(fetched, inserted, ignored);
        } finally {
            saveBySinceLock.unlock();
        }
    }

    private PageCapture capturePage(List<GroupMessagesResponse.Message> messages,
                                    long gid, long capturedAt,
                                    Predicate<GroupMessagesResponse.Message> reachedBoundary) {
        int inserted = 0;
        int ignored = 0;
        for (int index = messages.size() - 1; index >= 0; index--) {
            GroupMessagesResponse.Message message = messages.get(index);
            requireMid(message);
            if (reachedBoundary.test(message)) {
                return new PageCapture(inserted, ignored + index + 1, true);
            }
            var entity = messageMapper.toMessageEntity(message, gid, capturedAt);
            if (entity.isPresent() && messageRepository.insertIfAbsent(entity.orElseThrow())) {
                inserted++;
            } else {
                ignored++;
            }
        }
        return new PageCapture(inserted, ignored, false);
    }

    public MediaBinary queryMessageMedia(long gid, long mid, String variant) {
        validateGid(gid);
        if (!"preview".equals(variant) && !"original".equals(variant)) {
            throw new InvalidRequestException("variant 必须是 preview 或 original。");
        }
        MessageRecord message = requireLocalMessage(gid, mid);
        GroupMediaRequest request = mediaRequest(message, variant);
        try {
            var response = groupMediaApi.download(request);
            if (response == null || !response.getStatusCode().is2xxSuccessful()) {
                throw new WeiboException("群消息媒体下载失败。", -1);
            }
            return messageMapper.toMediaBinary(response);
        } catch (WeiboCookieExpiredException | WeiboRateLimitException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new WeiboException("群消息媒体下载失败。", -1, e);
        }
    }

    public <T> T streamMessageVideo(long gid, long mid, ResponseExtractor<T> responseExtractor) {
        return streamMessageVideo(gid, mid, new HttpHeaders(), responseExtractor);
    }

    public <T> T streamMessageVideo(long gid, long mid, HttpHeaders requestHeaders,
                                    ResponseExtractor<T> responseExtractor) {
        validateGid(gid);
        MessageRecord message = requireLocalMessage(gid, mid);
        if (!messageMapper.isVideo(message)) {
            throw new InvalidRequestException("该消息不是视频消息。");
        }
        GroupMediaRequest request = new GroupMediaRequest(
                requireMediaReference(message.fid()), null);
        try {
            return groupMediaApi.stream(request, requestHeaders, response -> {
                if (!response.getStatusCode().is2xxSuccessful()
                        && response.getStatusCode() != HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE) {
                    throw new WeiboException("群消息媒体下载失败。", -1);
                }
                return responseExtractor.extractData(response);
            });
        } catch (WeiboCookieExpiredException | WeiboRateLimitException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new WeiboException("群消息媒体下载失败。", -1, e);
        }
    }

    private GroupMediaRequest mediaRequest(MessageRecord message, String variant) {
        if ("original".equals(variant)) {
            if (message.mediaType() != 1) {
                throw new InvalidRequestException("original 仅支持图片消息。");
            }
            return new GroupMediaRequest(requireMediaReference(message.fid()), "origin");
        }
        if (message.mediaType() == 1) {
            return new GroupMediaRequest(requireMediaReference(message.fid()), "compress");
        }
        if (messageMapper.isVideo(message)) {
            if (!message.videoCoverFid().isBlank()) {
                return new GroupMediaRequest(message.videoCoverFid(), null);
            }
            throw new ResourceNotFoundException("本地群消息媒体引用不存在。");
        }
        throw new InvalidRequestException("该消息类型不支持 preview。");
    }

    private MessageRecord requireLocalMessage(long gid, long mid) {
        MessageRecord message = messageMapper.toMessageRecord(messageRepository.findById(mid)
                .orElseThrow(() -> new ResourceNotFoundException("本地群消息不存在。")));
        if (message.gid() != gid) {
            throw new ResourceNotFoundException("本地群消息不存在。");
        }
        return message;
    }

    private GroupListView toGroupListView(GroupEntity entity, MessageRecord latestMessage) {
        GroupRecord group = messageMapper.toGroupRecord(entity);
        String senderName = latestMessage == null ? "" : latestMessage.senderName();
        String message = latestMessage == null ? "" : latestMessage.text();
        if (latestMessage != null && (message == null || message.isBlank())) {
            message = "[" + latestMessage.msgTypeName() + "]";
        }
        return new GroupListView(group.gid(), group.name(), group.avatar(), group.memberCount(),
                group.maxMember(), group.ownerId(), group.admins(), group.summary(), group.groupType(),
                senderName == null ? "" : senderName, message == null ? "" : message);
    }

    private String requireMediaReference(String reference) {
        if (reference == null || reference.isBlank()) {
            throw new ResourceNotFoundException("本地群消息媒体引用不存在。");
        }
        return reference;
    }

    private List<GroupMessagesResponse.Message> requireMessages(GroupMessagesResponse response) {
        if (response == null || !response.result()) {
            throw new WeiboException("群消息响应失败：result != true。", -1);
        }
        if (response.messages() == null) {
            throw new WeiboException("群消息响应缺少 messages。", -1);
        }
        return response.messages();
    }

    private long requireMid(GroupMessagesResponse.Message message) {
        if (message == null || message.id() == null) {
            throw new WeiboException("群消息响应缺少消息 mid。", -1);
        }
        return message.id();
    }

    private void validateGid(long gid) {
        if (gid <= 0) {
            throw new InvalidRequestException("gid 必须大于 0。");
        }
    }

    @SuppressWarnings("DuplicatedCode")
    private void validateQuery(Long start, Long end, int page, int size) {
        if (page < 1) {
            throw new InvalidRequestException("page 必须大于等于 1。");
        }
        if (size < 1 || size > 100) {
            throw new InvalidRequestException("size 必须介于 1 和 100 之间。");
        }
        if (start != null && end != null && start > end) {
            throw new InvalidRequestException("start 不能晚于 end。");
        }
    }

    private record PageCapture(int inserted, int ignored, boolean reachedBoundary) {
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WeiboException("群消息拉取等待被中断。", -1, e);
        }
    }
}
