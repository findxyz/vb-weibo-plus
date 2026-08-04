package xyz.fz.weibo.client;

import xyz.fz.weibo.client.exception.WeiboException;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * MD5 摘要工具：群聊媒体上传（图片、视频封面与分片）统一使用。
 */
public final class DigestUtils {

    private DigestUtils() {
    }

    public static String md5Hex(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hash = digest.digest(bytes);
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new WeiboException("MD5 算法不可用：" + e.getMessage(), e);
        }
    }
}
