package xyz.fz.weibo.service;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
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
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MblogResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;
import xyz.fz.weibo.repository.BloggerRepository;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.mapper.PostMapper;

import java.util.List;

@Service
public class PostService {

    private final MyBlogApi myBlogApi;
    private final LongTextApi longTextApi;
    private final PostMapper postMapper;
    private final BloggerRepository bloggerRepository;
    private final PostRepository postRepository;

    public PostService(MyBlogApi myBlogApi, LongTextApi longTextApi, PostMapper postMapper,
                       BloggerRepository bloggerRepository, PostRepository postRepository) {
        this.myBlogApi = myBlogApi;
        this.longTextApi = longTextApi;
        this.postMapper = postMapper;
        this.bloggerRepository = bloggerRepository;
        this.postRepository = postRepository;
    }

    public SaveResult saveIncremental(long uid) {
        if (uid <= 0) {
            throw new InvalidRequestException("uid 必须大于 0。");
        }

        MyBlogResponse response = myBlogApi.myBlog(new MyBlogRequest(uid, 1, null));
        List<MblogResponse> posts = requirePosts(response);
        if (posts.isEmpty()) {
            return new SaveResult(0, 0, 0);
        }

        long capturedAt = System.currentTimeMillis();
        BloggerEntity blogger = postMapper.toBloggerEntity(posts.getFirst().user(), capturedAt);
        bloggerRepository.upsertMetadata(blogger);

        int inserted = 0;
        for (MblogResponse post : posts) {
            LongTextResponse currentLongText = fetchLongText(post);
            LongTextResponse retweetedLongText = fetchLongText(post.retweetedStatus());
            PostEntity entity = postMapper.toPostEntity(
                    post, currentLongText, retweetedLongText, capturedAt);
            if (postRepository.insertIfAbsent(entity)) {
                inserted++;
            }
        }

        long latestPostId = postRepository.findMaxPostIdByUid(uid);
        bloggerRepository.refreshLatestPostId(uid, latestPostId);
        return new SaveResult(posts.size(), inserted, posts.size() - inserted);
    }

    public List<BloggerRecord> queryBloggers() {
        return postMapper.toBloggerRecords(bloggerRepository.findAllOrdered());
    }

    public PostQueryResult queryPosts(List<Long> uids, Long start, Long end, int page, int size) {
        validateQuery(start, end, page, size);
        Page<PostEntity> result = postRepository.findPage(
                uids, start, end, PostRepository.pageRequest(page, size));
        List<BloggerEntity> bloggers = bloggerRepository.findAllOrdered();
        List<PostView> items = postMapper.toPostViews(result.getContent(), bloggers);
        return new PostQueryResult(items, page, size, result.getTotalElements());
    }

    private List<MblogResponse> requirePosts(MyBlogResponse response) {
        if (response == null || response.ok() != 1) {
            int errorCode = response == null || response.ok() == 0 ? -1 : response.ok();
            throw new WeiboException("微博列表响应失败：ok != 1。", errorCode);
        }
        if (response.data() == null || response.data().list() == null) {
            throw new WeiboException("微博列表响应缺少 data.list。", -1);
        }
        return response.data().list();
    }

    private LongTextResponse fetchLongText(MblogResponse post) {
        if (post == null || !post.isLongText()) {
            return null;
        }
        LongTextResponse response = longTextApi.longText(new LongTextRequest(post.mblogId()));
        if (response == null || response.ok() != 1 || response.data() == null) {
            int errorCode = response == null || response.ok() == 0 ? -1 : response.ok();
            throw new WeiboException("长文响应失败：mblogId = " + post.mblogId() + "。", errorCode);
        }
        return response;
    }

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
}
