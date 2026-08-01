package xyz.fz.weibo.model.response;

/**
 * 群聊发送图片：初始化文件响应（fileplatform/init.json）。
 * <p>
 * fileToken 为本次上传的动态令牌，后续 uploadx 使用；length 为分片大小（KB）；urlTag 为上传节点标识。
 */
public record GroupMediaUploadInitResponse(String fileToken, int length, int urlTag) {
}
