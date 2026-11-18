package xyz.fz.weibo.model.response;

public record PicInfoResponse(
        ApiImage thumbnail,
        ApiImage large,
        ApiImage original,
        ApiImage largest
) {

    public record ApiImage(String url, int width, int height) {
    }
}
