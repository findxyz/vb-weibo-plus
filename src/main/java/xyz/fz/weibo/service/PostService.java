package xyz.fz.weibo.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import xyz.fz.weibo.api.DirectMediaApi;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.client.exception.WeiboCookieExpiredException;
import xyz.fz.weibo.client.exception.WeiboRateLimitException;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.MediaBinary;
import xyz.fz.weibo.domain.PicInfo;
import xyz.fz.weibo.domain.PostQueryResult;
import xyz.fz.weibo.domain.PostRecord;
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
import xyz.fz.weibo.repository.BloggerRepository;
import xyz.fz.weibo.repository.PostRepository;
import xyz.fz.weibo.service.exception.InvalidRequestException;
import xyz.fz.weibo.service.exception.ResourceNotFoundException;
import xyz.fz.weibo.service.mapper.PostMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Stream;

@Service
public class PostService {

    private static final Logger log = LoggerFactory.getLogger(PostService.class);
    private static final ZoneId REQUEST_TIME_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter LOG_TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MyBlogApi myBlogApi;
    private final SearchProfileApi searchProfileApi;
    private final LongTextApi longTextApi;
    private final DirectMediaApi directMediaApi;
    private final PostMapper postMapper;
    private final BloggerRepository bloggerRepository;
    private final PostRepository postRepository;
    private final ReentrantLock saveByRangeLock = new ReentrantLock();

    public PostService(MyBlogApi myBlogApi, SearchProfileApi searchProfileApi,
                       LongTextApi longTextApi, DirectMediaApi directMediaApi,
                       PostMapper postMapper,
                       BloggerRepository bloggerRepository, PostRepository postRepository) {
        this.myBlogApi = myBlogApi;
        this.searchProfileApi = searchProfileApi;
        this.longTextApi = longTextApi;
        this.directMediaApi = directMediaApi;
        this.postMapper = postMapper;
        this.bloggerRepository = bloggerRepository;
        this.postRepository = postRepository;
    }

    public SaveResult saveIncremental(long uid) {
        if (uid <= 0) {
            throw new InvalidRequestException("uid 必须大于 0。");
        }

        long latestPostId = bloggerRepository.findLatestPostId(uid);
        int page = 1;
        String sinceId = null;
        int fetched = 0;
        int inserted = 0;
        int ignored = 0;
        long oldestTime = Long.MAX_VALUE;
        long newestTime = Long.MIN_VALUE;
        while (true) {
            MyBlogResponse response = myBlogApi.myBlog(new MyBlogRequest(uid, page, sinceId));
            List<MblogResponse> posts = requirePosts(response);
            if (posts.isEmpty()) {
                break;
            }

            long capturedAt = System.currentTimeMillis();
            BloggerEntity blogger = postMapper.toBloggerEntity(posts.getFirst().user(), capturedAt);
            bloggerRepository.upsertMetadata(blogger);

            boolean reachedBoundary = false;
            for (MblogResponse post : posts) {
                fetched++;
                if (latestPostId > 0 && post.id() <= latestPostId) {
                    ignored++;
                    reachedBoundary = true;
                    continue;
                }
                long postTime = postMapper.parseCreatedAt(post.createdAt());
                oldestTime = Math.min(oldestTime, postTime);
                newestTime = Math.max(newestTime, postTime);
                if (capturePost(post, capturedAt)) {
                    inserted++;
                } else {
                    ignored++;
                }
            }

            if (latestPostId == 0 || reachedBoundary) {
                break;
            }
            if (response.data().sinceId() == null || response.data().sinceId().isBlank()) {
                throw new WeiboException("微博列表响应缺少 data.since_id。", -1);
            }
            page++;
            sinceId = response.data().sinceId();
        }

        if (fetched > 0 || latestPostId > 0) {
            long currentLatestPostId = postRepository.findMaxPostIdByUid(uid);
            bloggerRepository.refreshLatestPostId(uid, currentLatestPostId);
        }
        if (inserted > 0) {
            log.info("博主 {} 增量同步：拉取 {} 条，新增 {} 条，忽略 {} 条，最旧 {}，最新 {}",
                    uid, fetched, inserted, ignored,
                    formatTimestamp(oldestTime), formatTimestamp(newestTime));
        }
        return new SaveResult(fetched, inserted, ignored);
    }

    public SaveResult saveByRange(long uid, long startMillis, long endMillis) {
        if (!saveByRangeLock.tryLock()) {
            log.warn("博主 {} 历史同步跳过：已有同步任务在运行。", uid);
            return new SaveResult(0, 0, 0);
        }
        try {
            if (uid <= 0) {
                throw new InvalidRequestException("uid 必须大于 0。");
            }
            if (startMillis > endMillis) {
                throw new InvalidRequestException("start 不能晚于 end。");
            }

            int fetched = 0;
            int inserted = 0;
            int ignored = 0;
            long oldestTime = Long.MAX_VALUE;
            long newestTime = Long.MIN_VALUE;
            boolean firstRequest = true;
            LocalDate firstDate = Instant.ofEpochMilli(startMillis)
                    .atZone(REQUEST_TIME_ZONE).toLocalDate();
            LocalDate lastDate = Instant.ofEpochMilli(endMillis)
                    .atZone(REQUEST_TIME_ZONE).toLocalDate();
            for (LocalDate date = firstDate; !date.isAfter(lastDate); date = date.plusDays(1)) {
                long dayStartMillis = date.equals(firstDate)
                        ? startMillis
                        : date.atStartOfDay(REQUEST_TIME_ZONE).toInstant().toEpochMilli();
                long dayEndMillis = date.equals(lastDate)
                        ? endMillis
                        : date.plusDays(1).atStartOfDay(REQUEST_TIME_ZONE).toInstant().toEpochMilli() - 1;
                int page = 1;
                while (true) {
                    if (!firstRequest) {
                        sleep(ThreadLocalRandom.current().nextLong(200, 2_001));
                    }
                    firstRequest = false;
                    SearchProfileResponse response = searchProfileApi.searchProfile(
                            new SearchProfileRequest(uid, page,
                                    Math.floorDiv(dayStartMillis, 1000),
                                    Math.floorDiv(dayEndMillis, 1000)));
                    List<MblogResponse> posts = requirePosts(response);
                    if (posts.isEmpty()) {
                        break;
                    }

                    long capturedAt = System.currentTimeMillis();
                    BloggerEntity blogger = postMapper.toBloggerEntity(posts.getFirst().user(), capturedAt);
                    bloggerRepository.upsertMetadata(blogger);
                    for (MblogResponse post : posts) {
                        fetched++;
                        long postTime = postMapper.parseCreatedAt(post.createdAt());
                        oldestTime = Math.min(oldestTime, postTime);
                        newestTime = Math.max(newestTime, postTime);
                        if (capturePost(post, capturedAt)) {
                            inserted++;
                        } else {
                            ignored++;
                        }
                    }
                    page++;
                }
            }
            if (inserted > 0) {
                log.info("博主 {} 历史同步：拉取 {} 条，新增 {} 条，忽略 {} 条，最旧 {}，最新 {}",
                        uid, fetched, inserted, ignored,
                        formatTimestamp(oldestTime), formatTimestamp(newestTime));
            } else {
                log.info("博主 {} 历史同步完成：拉取 {} 条，无新增。", uid, fetched);
            }
            return new SaveResult(fetched, inserted, ignored);
        } finally {
            saveByRangeLock.unlock();
        }
    }

    public List<BloggerRecord> queryBloggers() {
        return postMapper.toBloggerRecords(bloggerRepository.findAllOrdered());
    }

    public PostQueryResult queryPosts(
            List<Long> uids, Long start, Long end, String keyword, int page, int size) {
        validateQuery(start, end, page, size);
        Page<PostEntity> result = postRepository.findPage(
                uids, start, end, keyword, PostRepository.pageRequest(page, size));
        List<BloggerEntity> bloggers = bloggerRepository.findAllOrdered();
        List<PostView> items = postMapper.toPostViews(result.getContent(), bloggers);
        return new PostQueryResult(items, page, size, result.getTotalElements());
    }

    public MediaBinary queryPostImage(String mblogId, String pid, String variant) {
        if (!"thumbnail".equals(variant) && !"original".equals(variant)) {
            throw new InvalidRequestException("variant 必须是 thumbnail 或 original。");
        }
        PostRecord post = findPost(mblogId);
        Stream<PicInfo> retweetedPictures = post.retweeted() == null
                ? Stream.empty()
                : post.retweeted().pics().stream();
        PicInfo picture = Stream.concat(post.pics().stream(), retweetedPictures)
                .filter(pic -> pic.pid().equals(pid))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("本地微博图片不存在。"));
        String reference = "thumbnail".equals(variant)
                ? picture.thumbnail().url()
                : picture.original().url();
        requireMediaReference(reference);
        return downloadMedia(reference);
    }

    public MediaBinary queryPostVideoCover(String mblogId, boolean retweeted) {
        PostRecord post = findPost(mblogId);
        String reference;
        if (retweeted) {
            if (post.retweeted() == null) {
                throw new ResourceNotFoundException("本地转发微博不存在。");
            }
            reference = post.retweeted().videoCoverUrl();
        } else {
            reference = post.video().coverUrl();
        }
        requireMediaReference(reference);
        return downloadMedia(reference);
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

    private List<MblogResponse> requirePosts(SearchProfileResponse response) {
        if (response == null || response.ok() != 1) {
            int errorCode = response == null || response.ok() == 0 ? -1 : response.ok();
            throw new WeiboException("微博搜索响应失败：ok != 1。", errorCode);
        }
        if (response.data() == null || response.data().list() == null) {
            throw new WeiboException("微博搜索响应缺少 data.list。", -1);
        }
        return response.data().list();
    }

    private boolean capturePost(MblogResponse post, long capturedAt) {
        LongTextResponse currentLongText = fetchLongText(post);
        LongTextResponse retweetedLongText = fetchLongText(post.retweetedStatus());
        PostEntity entity = postMapper.toPostEntity(
                post, currentLongText, retweetedLongText, capturedAt);
        return postRepository.insertIfAbsent(entity);
    }

    private MediaBinary downloadMedia(String reference) {
        try {
            ResponseEntity<byte[]> response = directMediaApi.download(reference);
            if (response == null || !response.getStatusCode().is2xxSuccessful()) {
                throw new WeiboException("微博媒体下载失败。", -1);
            }
            return postMapper.toMediaBinary(response);
        } catch (WeiboCookieExpiredException | WeiboRateLimitException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new WeiboException("微博媒体下载失败。", -1, e);
        }
    }

    private PostRecord findPost(String mblogId) {
        return postMapper.toPostRecord(postRepository.findById(mblogId)
                .orElseThrow(() -> new ResourceNotFoundException("本地微博不存在。")));
    }

    private void requireMediaReference(String reference) {
        if (reference == null || reference.isBlank()) {
            throw new ResourceNotFoundException("本地微博媒体引用不存在。");
        }
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

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WeiboException("微博范围保存等待被中断。", -1, e);
        }
    }

    private static String formatTimestamp(long epochMillis) {
        return Instant.ofEpochMilli(epochMillis)
                .atZone(REQUEST_TIME_ZONE)
                .format(LOG_TIMESTAMP_FORMAT);
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
}
