package xyz.fz.weibo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.fz.weibo.api.LongTextApi;
import xyz.fz.weibo.api.MyBlogApi;
import xyz.fz.weibo.api.SearchProfileApi;
import xyz.fz.weibo.model.request.LongTextRequest;
import xyz.fz.weibo.model.request.MyBlogRequest;
import xyz.fz.weibo.model.request.SearchProfileRequest;
import xyz.fz.weibo.model.response.LongTextResponse;
import xyz.fz.weibo.model.response.MyBlogResponse;
import xyz.fz.weibo.model.response.SearchProfileResponse;

/**
 * 微博内容接口：我的微博列表与长文。
 */
@RestController
@RequestMapping("/weibo/blog")
public class WeiboBlogController {

    private final MyBlogApi myBlogApi;
    private final LongTextApi longTextApi;
    private final SearchProfileApi searchProfileApi;

    public WeiboBlogController(MyBlogApi myBlogApi, LongTextApi longTextApi, SearchProfileApi searchProfileApi) {
        this.myBlogApi = myBlogApi;
        this.longTextApi = longTextApi;
        this.searchProfileApi = searchProfileApi;
    }

    @GetMapping("/mymblog")
    public MyBlogResponse myblog(@RequestParam Long uid,
                                 @RequestParam Integer page,
                                 @RequestParam(required = false) String sinceId) {
        return myBlogApi.myBlog(new MyBlogRequest(uid, page, sinceId));
    }

    @GetMapping("/longtext")
    public LongTextResponse longtext(@RequestParam Long id) {
        return longTextApi.longText(new LongTextRequest(id));
    }

    @GetMapping("/searchProfile")
    public SearchProfileResponse searchProfile(@RequestParam Long uid,
                                               @RequestParam Integer page,
                                               @RequestParam Long starttime,
                                               @RequestParam Long endtime) {
        return searchProfileApi.searchProfile(new SearchProfileRequest(uid, page, starttime, endtime));
    }
}
