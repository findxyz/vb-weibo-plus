package xyz.fz.weibo.service.mapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import xyz.fz.weibo.config.WeiboConfig;
import xyz.fz.weibo.domain.BloggerRecord;
import xyz.fz.weibo.domain.PostRecord;
import xyz.fz.weibo.domain.PostView;
import xyz.fz.weibo.entity.BloggerEntity;
import xyz.fz.weibo.entity.PostEntity;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MblogResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;

import java.io.InputStream;
import java.util.List;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringJUnitConfig(classes = {WeiboConfig.class, PostMapper.class})
class PostMapperTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PostMapper postMapper;

    @Test
    void apiModelAcceptsCompleteBloggerBlogShapeAndStringLongTextId() throws Exception {
        MblogResponse post = readPost();

        assertThat(post.textRaw()).isEqualTo("截断纯文本");
        assertThat(post.user().avatarLarge()).isEqualTo("https://image/avatar.jpg");
        assertThat(post.picInfos()).containsKey("p1");
        assertThat(post.pageInfo().mediaInfo().h5Url())
                .isEqualTo("https://video.weibo.com/show?fid=current");
        assertThat(post.retweetedStatus().mblogId()).isEqualTo("retweeted-id");
        assertThat(new LongTextRequest("R5bs4vcVf").toParams()).containsEntry("id", "R5bs4vcVf");
    }

    @Test
    @ResourceLock("default-locale")
    void mapsCompleteLongTextMediaDatesAndSourceThroughConfiguredObjectMapper() throws Exception {
        Locale originalLocale = Locale.getDefault();
        Locale.setDefault(Locale.SIMPLIFIED_CHINESE);
        try {
            MblogResponse post = readPost();
            PostEntity entity = postMapper.toPostEntity(post,
                    longText("当前完整 HTML", "当前完整纯文本"),
                    longText("转发完整 HTML", "转发完整纯文本"), 2000);
            PostRecord record = postMapper.toPostRecord(entity);

            assertThat(entity.getContent()).isEqualTo("当前完整 HTML");
            assertThat(entity.getContentRaw()).isEqualTo("当前完整纯文本");
            assertThat(entity.getSource()).isEqualTo("微博客户端");
            assertThat(entity.getCreatedAt()).isEqualTo(1783678735000L);
            assertThat(record.pics()).singleElement().satisfies(pic -> {
                assertThat(pic.pid()).isEqualTo("p1");
                assertThat(pic.original().url()).isEqualTo("https://image/largest.jpg");
                assertThat(pic.original().width()).isEqualTo(1200);
            });
            assertThat(record.video().coverUrl()).isEqualTo("https://image/cover.jpg");
            assertThat(record.video().pageUrl()).isEqualTo("https://video.weibo.com/show?fid=current");
            assertThat(record.retweeted().content()).isEqualTo("转发完整 HTML");
            assertThat(record.retweeted().contentRaw()).isEqualTo("转发完整纯文本");
            assertThat(record.retweeted().createdAt()).isEqualTo(1783562400000L);
            assertThat(record.retweeted().pics()).singleElement()
                    .satisfies(pic -> assertThat(pic.original().url())
                            .isEqualTo("https://image/retweeted-large.jpg"));
        } finally {
            Locale.setDefault(originalLocale);
        }
    }

    @Test
    void mapsBloggerAndLocalQueryViewWithoutExposingCapturedMediaReferences() throws Exception {
        MblogResponse post = readPost();
        BloggerEntity blogger = postMapper.toBloggerEntity(post.user(), 2000);
        PostEntity entity = postMapper.toPostEntity(post,
                longText("当前完整 HTML", "当前完整纯文本"),
                longText("转发完整 HTML", "转发完整纯文本"), 2000);

        BloggerRecord bloggerRecord = postMapper.toBloggerRecord(blogger);
        List<PostView> views = postMapper.toPostViews(List.of(entity), List.of(blogger));

        assertThat(bloggerRecord.uid()).isEqualTo(1);
        assertThat(bloggerRecord.avatar()).isEqualTo("https://image/avatar.jpg");
        assertThat(bloggerRecord.verified()).isTrue();
        assertThat(views).singleElement().satisfies(view -> {
            assertThat(view.content()).isEqualTo("当前完整 HTML");
            assertThat(view.blogger()).isEqualTo(bloggerRecord);
            assertThat(view.pics()).singleElement().satisfies(image -> {
                assertThat(image.pid()).isEqualTo("p1");
                assertThat(image.thumbnailUrl()).isEmpty();
                assertThat(image.originalUrl()).isEmpty();
            });
            assertThat(view.video().coverUrl()).isEmpty();
            assertThat(view.video().pageUrl()).isEqualTo("https://video.weibo.com/show?fid=current");
            assertThat(view.retweeted().contentRaw()).isEqualTo("转发完整纯文本");
            assertThat(view.retweeted().video().coverUrl()).isEmpty();
        });
    }

    @Test
    void rejectsInvalidUpstreamDate() throws Exception {
        MblogResponse source = readPost();
        MblogResponse invalid = new MblogResponse(source.id(), source.mblogId(), "not-a-date", source.text(),
                source.textRaw(), source.source(), source.regionName(), source.isLongText(),
                source.picNum(), source.repostsCount(), source.commentsCount(), source.attitudesCount(),
                source.user(), source.picInfos(), source.pageInfo(), source.retweetedStatus());

        assertThatThrownBy(() -> postMapper.toPostEntity(invalid,
                longText("全文", "纯文本"), longText("转发全文", "转发纯文本"), 2000))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private MblogResponse readPost() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/fixtures/blogger-blog-page.json")) {
            MyBlogResponse response = objectMapper.readValue(input, MyBlogResponse.class);
            return response.data().list().getFirst();
        }
    }

    private LongTextResponse longText(String content, String contentRaw) {
        return new LongTextResponse(new LongTextResponse.LongTextData(
                content, contentRaw, false, null), 1);
    }
}
