package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.GroupRecord;
import xyz.fz.weibo.service.ChatService;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ChatController.class)
class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ChatService chatService;

    @Test
    void syncHasNoRequestArgumentsAndReturnsTheFullLocalGroupList() throws Exception {
        when(chatService.syncGroups()).thenReturn(List.of(group(2), group(1)));

        assertThat(ChatController.class.getMethod("syncGroups").getParameterCount()).isZero();
        mockMvc.perform(post("/chat/groups/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gid").value(2))
                .andExpect(jsonPath("$[0].admins[0]").value(10))
                .andExpect(jsonPath("$[1].gid").value(1));

        verify(chatService).syncGroups();
    }

    @Test
    void listsLocalGroupsIncludingGidOnlyPlaceholders() throws Exception {
        when(chatService.queryGroups()).thenReturn(List.of(
                new GroupRecord(3, "", "", 0, 0, 0, List.of(), "", 0)
        ));

        mockMvc.perform(get("/chat/groups"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gid").value(3))
                .andExpect(jsonPath("$[0].name").value(""))
                .andExpect(jsonPath("$[0].admins").isEmpty());

        verify(chatService).queryGroups();
    }

    @Test
    void mapsMissingUpstreamContactsToBadGateway() throws Exception {
        when(chatService.syncGroups())
                .thenThrow(new WeiboException("群列表响应缺少 contacts。", -1));

        mockMvc.perform(post("/chat/groups/sync"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502));
    }

    private GroupRecord group(long gid) {
        return new GroupRecord(gid, "群", "", 1, 500, 10, List.of(10L), "简介", 1);
    }
}
