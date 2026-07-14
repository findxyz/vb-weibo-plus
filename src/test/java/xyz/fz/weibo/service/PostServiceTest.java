package xyz.fz.weibo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.PostView;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.entity.BloggerEntity;
import xyz.fz.weibo.entity.PostEntity;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.request.MyBlogRequest;
import xyz.fz.weibo.model.response.ApiUserResponse;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MblogResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;
import xyz.fz.weibo.repository.BloggerRepository;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.mapper.PostMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class PostServiceTest {

    @Mock
    private MyBlogApi myBlogApi;

    @Mock
    private LongTextApi longTextApi;

    @Mock
    private PostMapper postMapper;

    @Mock
    private BloggerRepository bloggerRepository;

    @Mock
    private PostRepository postRepository;

    private PostService postService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        postService = new PostService(myBlogApi, longTextApi, postMapper,
                bloggerRepository, postRepository);
    }

    @Test
    void capturesExactlyLatestPageCompletesLongTextsAndCommitsCursorLast() {
        MblogResponse retweeted = post(90, "retweeted-id", true, null);
        MblogResponse current = post(100, "current-id", true, retweeted);
        LongTextResponse currentLongText = longText("当前完整正文");
        LongTextResponse retweetedLongText = longText("转发完整正文");
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 0, 1, 1);
        PostEntity entity = entity("current-id", 100);

        when(bloggerRepository.findLatestPostId(1)).thenReturn(0L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null)))
                .thenReturn(page(List.of(current)));
        when(longTextApi.longText(new LongTextRequest("current-id"))).thenReturn(currentLongText);
        when(longTextApi.longText(new LongTextRequest("retweeted-id"))).thenReturn(retweetedLongText);
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(any(), any(), any(), anyLong())).thenReturn(entity);
        when(postRepository.insertIfAbsent(entity)).thenReturn(true);
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(100L);

        SaveResult result = postService.saveIncremental(1);

        assertThat(result).isEqualTo(new SaveResult(1, 1, 0));
        verify(myBlogApi).myBlog(new MyBlogRequest(1L, 1, null));
        verifyNoMoreInteractions(myBlogApi);
        verify(postMapper).toPostEntity(eq(current), eq(currentLongText), eq(retweetedLongText),
                org.mockito.ArgumentMatchers.longThat(value -> value > 0));

        InOrder cursorOrder = inOrder(postRepository, bloggerRepository);
        cursorOrder.verify(postRepository).insertIfAbsent(entity);
        cursorOrder.verify(postRepository).findMaxPostIdByUid(1);
        cursorOrder.verify(bloggerRepository).refreshLatestPostId(1, 100);
    }

    @Test
    void duplicateOnLatestPageIsIgnoredWithoutOverwritingCapturedContent() {
        MblogResponse current = post(100, "current-id", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 0, 1, 1);
        PostEntity entity = entity("current-id", 100);
        when(bloggerRepository.findLatestPostId(1)).thenReturn(0L);
        when(myBlogApi.myBlog(any())).thenReturn(page(List.of(current)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(any(), any(), any(), anyLong())).thenReturn(entity);
        when(postRepository.insertIfAbsent(entity)).thenReturn(false);
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(100L);

        assertThat(postService.saveIncremental(1)).isEqualTo(new SaveResult(1, 0, 1));
        verify(longTextApi, never()).longText(any());
    }

    @Test
    void upstreamBusinessFailureDoesNotMapPersistOrRefreshCursor() {
        when(bloggerRepository.findLatestPostId(1)).thenReturn(0L);
        when(myBlogApi.myBlog(any())).thenReturn(new MyBlogResponse(null, 0));

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOfSatisfying(WeiboException.class,
                        error -> assertThat(error.getErrorCode()).isNotZero());

        verifyNoMoreInteractions(postMapper);
        verify(postRepository, never()).insertIfAbsent(any());
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
    }

    @Test
    void mappingFailurePreservesAlreadyCapturedContentAndOldCursor() {
        MblogResponse first = post(100, "first", false, null);
        MblogResponse second = post(101, "second", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 20, 1, 1);
        PostEntity firstEntity = entity("first", 100);
        when(bloggerRepository.findLatestPostId(1)).thenReturn(0L);
        when(myBlogApi.myBlog(any())).thenReturn(page(List.of(first, second)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(org.mockito.ArgumentMatchers.eq(first), any(), any(), anyLong()))
                .thenReturn(firstEntity);
        when(postMapper.toPostEntity(org.mockito.ArgumentMatchers.eq(second), any(), any(), anyLong()))
                .thenThrow(new IllegalArgumentException("Invalid Blogger Blog created_at"));
        when(postRepository.insertIfAbsent(firstEntity)).thenReturn(true);

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOf(IllegalArgumentException.class);

        verify(postRepository).insertIfAbsent(firstEntity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
    }

    @Test
    void queriesLocalRepositoriesWithValidationAndMapperOnly() {
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 2);
        BloggerRecord bloggerRecord = new BloggerRecord(1, "博主", "", "", false);
        PostEntity entity = entity("current-id", 100);
        PostView view = org.mockito.Mockito.mock(PostView.class);
        Page<PostEntity> page = new PageImpl<>(List.of(entity));
        when(bloggerRepository.findAllOrdered()).thenReturn(List.of(blogger));
        when(postMapper.toBloggerRecords(List.of(blogger))).thenReturn(List.of(bloggerRecord));
        when(postRepository.findPage(
                List.of(1L), 10L, 20L, PostRepository.pageRequest(1, 100))).thenReturn(page);
        when(postMapper.toPostViews(List.of(entity), List.of(blogger))).thenReturn(List.of(view));

        assertThat(postService.queryBloggers()).containsExactly(bloggerRecord);
        PostQueryResult result = postService.queryPosts(List.of(1L), 10L, 20L, 1, 100);

        assertThat(result.items()).containsExactly(view);
        assertThat(result.page()).isEqualTo(1);
        assertThat(result.size()).isEqualTo(100);
        assertThat(result.total()).isEqualTo(1);
        assertThatThrownBy(() -> postService.queryPosts(null, null, null, 0, 100))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> postService.queryPosts(null, null, null, 1, 101))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> postService.queryPosts(null, 20L, 10L, 1, 100))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoMoreInteractions(myBlogApi, longTextApi);
    }

    private MyBlogResponse page(List<MblogResponse> posts) {
        return new MyBlogResponse(new MyBlogResponse.MyBlogData(88L, posts, posts.size()), 1);
    }

    private LongTextResponse longText(String content) {
        return new LongTextResponse(
                new LongTextResponse.LongTextData(content, content + " raw", false, null), 1);
    }

    private MblogResponse post(long id, String mblogId, boolean longText, MblogResponse retweeted) {
        return new MblogResponse(id, mblogId, "Fri Jul 10 18:18:55 +0800 2026", "正文", "纯文本",
                "微博网页版", "", longText, 0, 0, 0, 0,
                new ApiUserResponse(1L, "博主", "", "", "", "/u/1", false),
                null, null, retweeted);
    }

    private PostEntity entity(String mblogId, long postId) {
        return new PostEntity(mblogId, postId, 1, "正文", "纯文本", "", "", "[]",
                "", "", "", 0, 0, 0, 100, 200);
    }
}
