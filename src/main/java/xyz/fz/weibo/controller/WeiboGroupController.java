package xyz.fz.weibo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.GroupListApi;
import xyz.fz.weibo.api.GroupMediaApi;
import xyz.fz.weibo.api.GroupMessagesApi;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupMessagesRequest;
import xyz.fz.weibo.model.request.GroupSendMessageRequest;
import xyz.fz.weibo.model.response.GroupListResponse;
import xyz.fz.weibo.model.response.GroupMessagesResponse;
import xyz.fz.weibo.model.response.GroupSendMessageResponse;

/**
 * 微博群聊接口：群列表与群消息。
 */
@RestController
@RequestMapping("/weibo/group")
public class WeiboGroupController {

    private final GroupListApi groupListApi;
    private final GroupMessagesApi groupMessagesApi;
    private final GroupMediaApi groupMediaApi;

    public WeiboGroupController(GroupListApi groupListApi, GroupMessagesApi groupMessagesApi, GroupMediaApi groupMediaApi) {
        this.groupListApi = groupListApi;
        this.groupMessagesApi = groupMessagesApi;
        this.groupMediaApi = groupMediaApi;
    }

    @GetMapping("/list")
    public GroupListResponse list() {
        return groupListApi.list();
    }

    @GetMapping("/messages")
    public GroupMessagesResponse messages(@RequestParam Long id,
                                           @RequestParam(required = false) Long maxMid) {
        return groupMessagesApi.messages(new GroupMessagesRequest(id, maxMid));
    }

    @PostMapping("/send")
    public GroupSendMessageResponse send(@RequestParam Long id, @RequestParam String content) {
        return groupMessagesApi.send(new GroupSendMessageRequest(id, content));
    }

    @GetMapping("/media")
    public ResponseEntity<byte[]> media(@RequestParam String fid,
                                        @RequestParam(required = false) String imageType) {
        return groupMediaApi.download(new GroupMediaRequest(fid, imageType));
    }
}
