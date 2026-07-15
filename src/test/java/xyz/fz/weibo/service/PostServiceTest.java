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
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.PostView;
import xyz.fz.weibo.domain.SaveResult;
import xyz.fz.weibo.entity.BloggerEntity;
import xyz.fz.weibo.entity.PostEntity;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.request.MyBlogRequest;
import xyz.fz.weibo.model.request.SearchProfileRequest;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MblogResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;
import xyz.fz.weibo.model.response.SearchProfileResponse;
import xyz.fz.weibo.model.response.UserResponse;
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
    private SearchProfileApi searchProfileApi;

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
        postService = new PostService(myBlogApi, searchProfileApi, longTextApi, postMapper,
                bloggerRepository, postRepository);
    }

    @Test
    void capturesSinglePartialDayUntilSuccessfulEmptyPage() {
        MblogResponse current = post(100, "current-id", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 0, 1, 1);
        PostEntity entity = entity("current-id", 100);
        SearchProfileRequest firstPage = new SearchProfileRequest(
                1L, 1, 1783652523L, 1783656184L);
        SearchProfileRequest emptyPage = new SearchProfileRequest(
                1L, 2, 1783652523L, 1783656184L);

        when(searchProfileApi.searchProfile(firstPage))
                .thenReturn(searchPage(List.of(current)));
        when(searchProfileApi.searchProfile(emptyPage))
                .thenReturn(searchPage(List.of()));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(any(), any(), any(), anyLong())).thenReturn(entity);
        when(postRepository.insertIfAbsent(entity)).thenReturn(true);

        assertThat(postService.saveByRange(1, 1783652523000L, 1783656184000L))
                .isEqualTo(new SaveResult(1, 1, 0));

        verify(searchProfileApi).searchProfile(firstPage);
        verify(searchProfileApi).searchProfile(emptyPage);
        verifyNoMoreInteractions(searchProfileApi);
        verify(postRepository).insertIfAbsent(entity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
    }

    @Test
    void capturesMultipleDaysWithInclusiveExactBoundsAndAggregatesCounts() {
        MblogResponse normal = post(100, "normal", false, null);
        MblogResponse retweeted = post(90, "retweeted-long", true, null);
        MblogResponse longText = post(110, "current-long", true, retweeted);
        MblogResponse duplicate = post(120, "duplicate", false, null);
        LongTextResponse currentLongText = longText("当前完整正文");
        LongTextResponse retweetedLongText = longText("转发完整正文");
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 0, 1, 1);
        PostEntity normalEntity = entity("normal", 100);
        PostEntity longTextEntity = entity("current-long", 110);
        PostEntity duplicateEntity = entity("duplicate", 120);

        SearchProfileRequest dayOne = new SearchProfileRequest(
                1L, 1, 1783652523L, 1783699199L);
        SearchProfileRequest dayTwo = new SearchProfileRequest(
                1L, 1, 1783699200L, 1783785599L);
        SearchProfileRequest dayThree = new SearchProfileRequest(
                1L, 1, 1783785600L, 1783828984L);
        when(searchProfileApi.searchProfile(dayOne)).thenReturn(searchPage(List.of(normal)));
        when(searchProfileApi.searchProfile(new SearchProfileRequest(
                1L, 2, 1783652523L, 1783699199L))).thenReturn(searchPage(List.of()));
        when(searchProfileApi.searchProfile(dayTwo)).thenReturn(searchPage(List.of(longText)));
        when(searchProfileApi.searchProfile(new SearchProfileRequest(
                1L, 2, 1783699200L, 1783785599L))).thenReturn(searchPage(List.of()));
        when(searchProfileApi.searchProfile(dayThree)).thenReturn(searchPage(List.of(duplicate)));
        when(searchProfileApi.searchProfile(new SearchProfileRequest(
                1L, 2, 1783785600L, 1783828984L))).thenReturn(searchPage(List.of()));
        when(longTextApi.longText(new LongTextRequest("current-long")))
                .thenReturn(currentLongText);
        when(longTextApi.longText(new LongTextRequest("retweeted-long")))
                .thenReturn(retweetedLongText);
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(normal), any(), any(), anyLong()))
                .thenReturn(normalEntity);
        when(postMapper.toPostEntity(eq(longText), eq(currentLongText),
                eq(retweetedLongText), anyLong())).thenReturn(longTextEntity);
        when(postMapper.toPostEntity(eq(duplicate), any(), any(), anyLong()))
                .thenReturn(duplicateEntity);
        when(postRepository.insertIfAbsent(normalEntity)).thenReturn(true);
        when(postRepository.insertIfAbsent(longTextEntity)).thenReturn(true);
        when(postRepository.insertIfAbsent(duplicateEntity)).thenReturn(false);

        assertThat(postService.saveByRange(1, 1783652523000L, 1783828984000L))
                .isEqualTo(new SaveResult(3, 2, 1));

        verify(searchProfileApi).searchProfile(dayOne);
        verify(searchProfileApi).searchProfile(dayTwo);
        verify(searchProfileApi).searchProfile(dayThree);
        verify(postMapper).toPostEntity(
                eq(longText), eq(currentLongText), eq(retweetedLongText),
                org.mockito.ArgumentMatchers.longThat(value -> value > 0));
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
    }

    @Test
    void acceptsEqualInclusiveRangeBounds() {
        SearchProfileRequest request = new SearchProfileRequest(
                1L, 1, 1783652523L, 1783652523L);
        when(searchProfileApi.searchProfile(request)).thenReturn(searchPage(List.of()));

        assertThat(postService.saveByRange(1, 1783652523000L, 1783652523000L))
                .isEqualTo(new SaveResult(0, 0, 0));

        verify(searchProfileApi).searchProfile(request);
    }

    @Test
    void rejectsInvalidRangeWithoutCallingUpstream() {
        assertThatThrownBy(() -> postService.saveByRange(
                1, 1783652523000L, 1783652522000L))
                .isInstanceOf(IllegalArgumentException.class);

        verify(searchProfileApi, never()).searchProfile(any());
    }

    @Test
    void preservesPartialCaptureAndRetryCompletesMissingRangeIdempotently() {
        MblogResponse first = post(100, "first", false, null);
        MblogResponse second = post(110, "second", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 0, 1, 1);
        PostEntity firstEntity = entity("first", 100);
        PostEntity secondEntity = entity("second", 110);
        SearchProfileRequest dayOne = new SearchProfileRequest(
                1L, 1, 1783652523L, 1783699199L);
        SearchProfileRequest dayOneEmpty = new SearchProfileRequest(
                1L, 2, 1783652523L, 1783699199L);
        SearchProfileRequest dayTwo = new SearchProfileRequest(
                1L, 1, 1783699200L, 1783702800L);
        SearchProfileRequest dayTwoEmpty = new SearchProfileRequest(
                1L, 2, 1783699200L, 1783702800L);

        when(searchProfileApi.searchProfile(dayOne))
                .thenReturn(searchPage(List.of(first)), searchPage(List.of(first)));
        when(searchProfileApi.searchProfile(dayOneEmpty))
                .thenReturn(searchPage(List.of()), searchPage(List.of()));
        when(searchProfileApi.searchProfile(dayTwo))
                .thenReturn(new SearchProfileResponse(null, 0), searchPage(List.of(second)));
        when(searchProfileApi.searchProfile(dayTwoEmpty)).thenReturn(searchPage(List.of()));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(first), any(), any(), anyLong())).thenReturn(firstEntity);
        when(postMapper.toPostEntity(eq(second), any(), any(), anyLong())).thenReturn(secondEntity);
        when(postRepository.insertIfAbsent(firstEntity)).thenReturn(true, false);
        when(postRepository.insertIfAbsent(secondEntity)).thenReturn(true);

        assertThatThrownBy(() -> postService.saveByRange(
                1, 1783652523000L, 1783702800000L))
                .isInstanceOf(WeiboException.class);
        verify(postRepository).insertIfAbsent(firstEntity);
        verify(postRepository, never()).insertIfAbsent(secondEntity);

        assertThat(postService.saveByRange(1, 1783652523000L, 1783702800000L))
                .isEqualTo(new SaveResult(2, 1, 1));

        verify(postRepository, org.mockito.Mockito.times(2)).insertIfAbsent(firstEntity);
        verify(postRepository).insertIfAbsent(secondEntity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
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
    void capturesAllNewPagesAndScansNewestToOldestBoundaryPageCompletely() {
        MblogResponse newest = post(130, "newest", false, null);
        MblogResponse newer = post(120, "newer", false, null);
        MblogResponse newAtBoundaryPage = post(110, "new-at-boundary-page", false, null);
        MblogResponse boundary = post(100, "boundary", false, null);
        MblogResponse older = post(90, "older", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity newestEntity = entity("newest", 130);
        PostEntity newerEntity = entity("newer", 120);
        PostEntity boundaryPageEntity = entity("new-at-boundary-page", 110);

        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null)))
                .thenReturn(page("next-page", List.of(newest, newer)));
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 2, "next-page")))
                .thenReturn(page("unused", List.of(newAtBoundaryPage, boundary, older)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(newest), any(), any(), anyLong())).thenReturn(newestEntity);
        when(postMapper.toPostEntity(eq(newer), any(), any(), anyLong())).thenReturn(newerEntity);
        when(postMapper.toPostEntity(eq(newAtBoundaryPage), any(), any(), anyLong()))
                .thenReturn(boundaryPageEntity);
        when(postRepository.insertIfAbsent(any())).thenReturn(true);
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(130L);

        assertThat(postService.saveIncremental(1)).isEqualTo(new SaveResult(5, 3, 2));

        verify(myBlogApi).myBlog(new MyBlogRequest(1L, 1, null));
        verify(myBlogApi).myBlog(new MyBlogRequest(1L, 2, "next-page"));
        verifyNoMoreInteractions(myBlogApi);
        verify(bloggerRepository).findLatestPostId(1);
        verify(postMapper, never()).toPostEntity(eq(boundary), any(), any(), anyLong());
        verify(postMapper, never()).toPostEntity(eq(older), any(), any(), anyLong());
        verify(bloggerRepository).refreshLatestPostId(1, 130);
    }

    @Test
    void scansOldestToNewestBoundaryPageCompletely() {
        MblogResponse older = post(90, "older", false, null);
        MblogResponse boundary = post(100, "boundary", false, null);
        MblogResponse newer = post(110, "newer", false, null);
        MblogResponse newest = post(120, "newest", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity newerEntity = entity("newer", 110);
        PostEntity newestEntity = entity("newest", 120);

        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null)))
                .thenReturn(page("unused", List.of(older, boundary, newer, newest)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(newer), any(), any(), anyLong())).thenReturn(newerEntity);
        when(postMapper.toPostEntity(eq(newest), any(), any(), anyLong())).thenReturn(newestEntity);
        when(postRepository.insertIfAbsent(any())).thenReturn(true);
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(120L);

        assertThat(postService.saveIncremental(1)).isEqualTo(new SaveResult(4, 2, 2));

        verify(postRepository).insertIfAbsent(newerEntity);
        verify(postRepository).insertIfAbsent(newestEntity);
        verify(myBlogApi).myBlog(new MyBlogRequest(1L, 1, null));
        verifyNoMoreInteractions(myBlogApi);
    }

    @Test
    void successfulEmptyPageStopsNormallyAndCommitsExistingCursor() {
        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null))).thenReturn(page(List.of()));
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(100L);

        assertThat(postService.saveIncremental(1)).isEqualTo(new SaveResult(0, 0, 0));

        verify(postRepository).findMaxPostIdByUid(1);
        verify(bloggerRepository).refreshLatestPostId(1, 100);
        verifyNoMoreInteractions(postMapper);
    }

    @Test
    void missingRequiredPaginationCursorFailsWithoutCommittingCursor() {
        MblogResponse current = post(110, "current", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity entity = entity("current", 110);
        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null)))
                .thenReturn(page(null, List.of(current)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(current), any(), any(), anyLong())).thenReturn(entity);
        when(postRepository.insertIfAbsent(entity)).thenReturn(true);

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);

        verify(postRepository).insertIfAbsent(entity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
        verify(myBlogApi).myBlog(new MyBlogRequest(1L, 1, null));
        verifyNoMoreInteractions(myBlogApi);
    }

    @Test
    void retriesAfterMiddlePageFailureWithoutOverwritingCapturedContent() {
        MblogResponse newest = post(130, "newest", false, null);
        MblogResponse newer = post(120, "newer", false, null);
        MblogResponse remaining = post(110, "remaining", false, null);
        MblogResponse boundary = post(100, "boundary", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity newestEntity = entity("newest", 130);
        PostEntity newerEntity = entity("newer", 120);
        PostEntity remainingEntity = entity("remaining", 110);

        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 1, null)))
                .thenReturn(page("next-page", List.of(newest, newer)));
        when(myBlogApi.myBlog(new MyBlogRequest(1L, 2, "next-page")))
                .thenThrow(new WeiboException("上游分页失败", -1))
                .thenReturn(page("unused", List.of(remaining, boundary)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(newest), any(), any(), anyLong())).thenReturn(newestEntity);
        when(postMapper.toPostEntity(eq(newer), any(), any(), anyLong())).thenReturn(newerEntity);
        when(postMapper.toPostEntity(eq(remaining), any(), any(), anyLong()))
                .thenReturn(remainingEntity);
        when(postRepository.insertIfAbsent(newestEntity)).thenReturn(true, false);
        when(postRepository.insertIfAbsent(newerEntity)).thenReturn(true, false);
        when(postRepository.insertIfAbsent(remainingEntity)).thenReturn(true);
        when(postRepository.findMaxPostIdByUid(1)).thenReturn(130L);

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);
        verify(postRepository).insertIfAbsent(newestEntity);
        verify(postRepository).insertIfAbsent(newerEntity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());

        assertThat(postService.saveIncremental(1)).isEqualTo(new SaveResult(4, 1, 3));

        verify(postRepository, org.mockito.Mockito.times(2)).insertIfAbsent(newestEntity);
        verify(postRepository, org.mockito.Mockito.times(2)).insertIfAbsent(newerEntity);
        verify(postRepository).insertIfAbsent(remainingEntity);
        verify(bloggerRepository).refreshLatestPostId(1, 130);
    }

    @Test
    void repositoryFailurePreservesEarlierCapturedContentAndOldCursor() {
        MblogResponse first = post(110, "first", false, null);
        MblogResponse second = post(120, "second", false, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity firstEntity = entity("first", 110);
        PostEntity secondEntity = entity("second", 120);
        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(any())).thenReturn(page("next-page", List.of(first, second)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(first), any(), any(), anyLong())).thenReturn(firstEntity);
        when(postMapper.toPostEntity(eq(second), any(), any(), anyLong())).thenReturn(secondEntity);
        when(postRepository.insertIfAbsent(firstEntity)).thenReturn(true);
        when(postRepository.insertIfAbsent(secondEntity))
                .thenThrow(new IllegalStateException("Database write failed"));

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOf(IllegalStateException.class);

        verify(postRepository).insertIfAbsent(firstEntity);
        verify(postRepository).insertIfAbsent(secondEntity);
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
    }

    @Test
    void longTextFailurePreservesEarlierCapturedContentAndOldCursor() {
        MblogResponse first = post(110, "first", false, null);
        MblogResponse longTextPost = post(120, "long-text", true, null);
        BloggerEntity blogger = new BloggerEntity(1L, "博主", "", "", 0, 100, 1, 1);
        PostEntity firstEntity = entity("first", 110);
        when(bloggerRepository.findLatestPostId(1)).thenReturn(100L);
        when(myBlogApi.myBlog(any())).thenReturn(page("next-page", List.of(first, longTextPost)));
        when(postMapper.toBloggerEntity(any(), anyLong())).thenReturn(blogger);
        when(postMapper.toPostEntity(eq(first), any(), any(), anyLong())).thenReturn(firstEntity);
        when(postRepository.insertIfAbsent(firstEntity)).thenReturn(true);
        when(longTextApi.longText(new LongTextRequest("long-text")))
                .thenThrow(new WeiboException("长文响应失败", -1));

        assertThatThrownBy(() -> postService.saveIncremental(1))
                .isInstanceOf(WeiboException.class);

        verify(postRepository).insertIfAbsent(firstEntity);
        verify(postMapper, never()).toPostEntity(eq(longTextPost), any(), any(), anyLong());
        verify(bloggerRepository, never()).refreshLatestPostId(anyLong(), anyLong());
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
        return page("88", posts);
    }

    private MyBlogResponse page(String sinceId, List<MblogResponse> posts) {
        return new MyBlogResponse(new MyBlogResponse.MyBlogData(sinceId, posts, posts.size()), 1);
    }

    private SearchProfileResponse searchPage(List<MblogResponse> posts) {
        return new SearchProfileResponse(
                new SearchProfileResponse.SearchProfileData(posts, posts.size(), ""), 1);
    }

    private LongTextResponse longText(String content) {
        return new LongTextResponse(
                new LongTextResponse.LongTextData(content, content + " raw", false, null), 1);
    }

    private MblogResponse post(long id, String mblogId, boolean longText, MblogResponse retweeted) {
        return new MblogResponse(id, mblogId, "Fri Jul 10 18:18:55 +0800 2026", "正文", "纯文本",
                "微博网页版", "", longText, 0, 0, 0, 0,
                new UserResponse(1L, "博主", "", "", "", "/u/1", false),
                null, null, retweeted);
    }

    private PostEntity entity(String mblogId, long postId) {
        return new PostEntity(mblogId, postId, 1, "正文", "纯文本", "", "", "[]",
                "", "", "", 0, 0, 0, 100, 200);
    }
}
