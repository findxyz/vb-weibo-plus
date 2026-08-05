package xyz.fz.weibo.model.response;

import java.util.List;

/**
 * 混合发布（多视频、图文混合）的媒体结构：视频与图片条目不再出现在 page_info / pic_infos，
 * 而是统一放在 mix_media_info.items 里。
 */
public record MixMediaInfoResponse(List<Item> items) {

    public record Item(String type, PageInfoResponse data) {
    }
}
