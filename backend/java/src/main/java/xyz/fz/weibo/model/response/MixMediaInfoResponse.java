package xyz.fz.weibo.model.response;

import java.util.List;

public record MixMediaInfoResponse(List<Item> items) {

    public record Item(String type, PageInfoResponse data) {}
}
