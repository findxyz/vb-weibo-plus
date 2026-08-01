package xyz.fz.weibo.model.response;

/**
 * 群聊发送图片：上传文件响应（uploadx.json）。
 * <p>
 * fid 为图片文件 id，发送消息时作为 fids。
 */
public record GroupMediaUploadResponse(long fid) {
}
