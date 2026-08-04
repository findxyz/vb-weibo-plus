package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResponseExtractor;
import xyz.fz.weibo.client.DigestUtils;
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupMediaUploadInitRequest;
import xyz.fz.weibo.model.request.GroupVideoInitRequest;
import xyz.fz.weibo.model.response.GroupMediaUploadInitResponse;
import xyz.fz.weibo.model.response.GroupMediaUploadResponse;
import xyz.fz.weibo.model.response.GroupVideoUploadInitResponse;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊媒体接口：msget 下载 + 图片上传（init/uploadx）+ 视频上传（封面/init/分片上传）。
 * <p>
 * 下载返回 byte[] 响应，透传 Content-Type / Content-Disposition 等响应头；
 * 图片上传为两步（init 初始化、uploadx 上传文件）；
 * 视频上传为四步（封面图 uploadx、multimedia/init 初始化、octet-stream 分片上传、send_message 发送），
 * 其中 send_message 在 GroupMessagesApi，其余在本类。
 */
@Component
public class GroupMediaApi {

    private static final String GROUP_MEDIA_URL = "https://upload.api.weibo.com/2/mss/msget";
    private static final String INIT_UPLOAD_URL = "https://api.weibo.com/webim/fileplatform/init.json";
    private static final String UPLOAD_URL = "https://api.weibo.com/webim/uploadx.json";
    private static final String VIDEO_INIT_URL = "https://api.weibo.com/webim/2/multimedia/init.json";
    private static final String VIDEO_UPLOAD_URL = "https://up.video.weibocdn.com/2/multimedia/upload.json";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public GroupMediaApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<byte[]> download(GroupMediaRequest request) {
        return client.getForBytes(GROUP_MEDIA_URL, request.toParams(), WeiboConstants.HEADERS_MSGET, true);
    }

    public <T> T stream(GroupMediaRequest request, HttpHeaders callerHeaders,
                        ResponseExtractor<T> responseExtractor) {
        Map<String, String> headers = new LinkedHashMap<>(callerHeaders.toSingleValueMap());
        headers.putAll(WeiboConstants.HEADERS_MSGET);
        return client.getForStream(
                GROUP_MEDIA_URL, request.toParams(), headers, true, responseExtractor);
    }

    /**
     * 群聊发送图片第 1 步：初始化文件（fileplatform/init.json，form-urlencoded）。
     */
    public GroupMediaUploadInitResponse initUpload(GroupMediaUploadInitRequest request) {
        ResponseEntity<String> resp = client.postForm(
                INIT_UPLOAD_URL, request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true);
        return deserialize(resp.getBody(), GroupMediaUploadInitResponse.class);
    }

    /**
     * 群聊发送图片第 2 步：分片上传文件（uploadx.json，multipart/form-data）。
     * <p>
     * source/is_chunk/selectId 走 query 参数，file/filetoken/startloc 走 multipart body。
     * 分片大小取自 init 响应的 length（单位 KB）。中间分片响应 {@code {"succ":true}}，
     * 最后一片响应 {@code {"fid":...}}。微博不回传 offset，由客户端按已上传字节累加 startloc。
     * chunkSizeKb <= 0 时退化为单次上传（兼容异常 init 响应）。
     */
    public GroupMediaUploadResponse upload(byte[] bytes, String filename, String fileToken,
                                           long gid, int chunkSizeKb) {
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("source", WeiboConstants.SOURCE);
        queryParams.put("is_chunk", "1");
        queryParams.put("selectId", String.valueOf(gid));
        int chunkSize = chunkSizeKb > 0 ? chunkSizeKb * 1024 : bytes.length;
        chunkSize = Math.min(chunkSize, bytes.length);
        long fid = 0;
        for (int startloc = 0; startloc < bytes.length; startloc += chunkSize) {
            int end = Math.min(startloc + chunkSize, bytes.length);
            byte[] chunk = Arrays.copyOfRange(bytes, startloc, end);
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new ImageByteArrayResource(chunk, filename));
            body.add("filetoken", fileToken);
            body.add("startloc", String.valueOf(startloc));
            body.add("source", WeiboConstants.SOURCE);
            body.add("filelength", "");
            body.add("filecheck", "");
            body.add("percent", "");
            ResponseEntity<String> resp = client.postMultipart(
                    UPLOAD_URL, queryParams, body, WeiboConstants.HEADERS_WEBIM_SEND, true);
            GroupMediaUploadResponse chunkResponse = deserialize(resp.getBody(), GroupMediaUploadResponse.class);
            if (chunkResponse.fid() > 0) {
                fid = chunkResponse.fid();
                break;
            }
        }
        if (fid <= 0) {
            throw new WeiboException("图片上传失败：未拿到文件 id。");
        }
        return new GroupMediaUploadResponse(fid);
    }

    private <T> T deserialize(String body, Class<T> type) {
        try {
            return objectMapper.readValue(body, type);
        } catch (JsonProcessingException e) {
            throw new WeiboException("响应反序列化失败：" + e.getMessage(), e);
        }
    }

    /**
     * 群聊发送视频第 1 步：上传封面图（uploadx.json，multipart/form-data）。
     * <p>
     * 与图片 upload 复用 uploadx.json，但 file part 字段名为 imageName（浏览器从视频提取的 PNG 封面），
     * 返回的 fid 在最终发送消息时写入 annotations.video_pic_fid，不是视频文件本身的 fid。
     */
    public GroupMediaUploadResponse uploadCover(byte[] coverBytes, String coverName, long gid) {
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("source", WeiboConstants.SOURCE);
        queryParams.put("gid", String.valueOf(gid));
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("imageName", new ImageByteArrayResource(coverBytes, coverName));
        ResponseEntity<String> resp = client.postMultipart(
                UPLOAD_URL, queryParams, body, WeiboConstants.HEADERS_WEBIM_SEND, true);
        GroupMediaUploadResponse coverResponse = deserialize(resp.getBody(), GroupMediaUploadResponse.class);
        if (coverResponse.fid() <= 0) {
            throw new WeiboException("视频封面上传失败：未拿到文件 id。", -1);
        }
        return coverResponse;
    }

    /**
     * 群聊发送视频第 2 步：初始化视频（webim/2/multimedia/init.json，form-urlencoded）。
     * <p>
     * 与图片 init 复用同一 header 组，但走不同 URL，并额外带 mediaprops（width/height/duration）。
     * 响应新增 auth（分片上传鉴权，用于 X-Up-Auth）与 mediaId。
     */
    public GroupVideoUploadInitResponse initVideoUpload(GroupVideoInitRequest request) {
        ResponseEntity<String> resp = client.postForm(
                VIDEO_INIT_URL, request.toParams(), WeiboConstants.HEADERS_WEBIM_SEND, true);
        return deserialize(resp.getBody(), GroupVideoUploadInitResponse.class);
    }

    /**
     * 群聊发送视频第 3 步：分片上传视频（up.video.weibocdn.com/2/multimedia/upload.json，octet-stream）。
     * <p>
     * 与图片 upload 的区别：走独立 CDN 主机；body 为原始分片二进制（非 multipart）；
     * header 带 X-Up-Auth（init 响应的 auth）；query 带 chunk/chunks/selectId/check/sectioncheck。
     * check 为整个文件的 MD5，sectioncheck 为当前分片的 MD5。最后一片响应 {@code {"fid":...}}。
     * chunkSizeKb <= 0 时退化为单次上传（兼容异常 init 响应）。
     */
    public GroupMediaUploadResponse uploadVideo(byte[] bytes, String filename, String fileToken,
                                                 String auth, long gid, int chunkSizeKb, String wholeMd5) {
        Map<String, String> headers = new LinkedHashMap<>(WeiboConstants.HEADERS_VIDEO_UPLOAD);
        headers.put("X-Up-Auth", auth);
        int chunkSize = chunkSizeKb > 0 ? chunkSizeKb * 1024 : bytes.length;
        chunkSize = Math.min(chunkSize, bytes.length);
        int chunks = (int) Math.ceil((double) bytes.length / chunkSize);
        long fid = 0;
        int chunkIndex = 0;
        for (int startloc = 0; startloc < bytes.length; startloc += chunkSize, chunkIndex++) {
            int end = Math.min(startloc + chunkSize, bytes.length);
            byte[] chunk = Arrays.copyOfRange(bytes, startloc, end);
            Map<String, String> queryParams = new LinkedHashMap<>();
            queryParams.put("name", filename);
            queryParams.put("chunk", String.valueOf(chunkIndex));
            queryParams.put("chunks", String.valueOf(chunks));
            queryParams.put("source", WeiboConstants.SOURCE);
            queryParams.put("filetoken", fileToken);
            queryParams.put("startloc", String.valueOf(startloc));
            queryParams.put("selectId", String.valueOf(gid));
            queryParams.put("check", wholeMd5);
            queryParams.put("sectioncheck", DigestUtils.md5Hex(chunk));
            ResponseEntity<String> resp = client.postOctetStream(
                    VIDEO_UPLOAD_URL, queryParams, chunk, headers, true);
            GroupMediaUploadResponse chunkResponse = deserialize(resp.getBody(), GroupMediaUploadResponse.class);
            if (chunkResponse.fid() > 0) {
                fid = chunkResponse.fid();
                break;
            }
        }
        if (fid <= 0) {
            throw new WeiboException("视频上传失败：未拿到文件 id。");
        }
        return new GroupMediaUploadResponse(fid);
    }

    /** ByteArrayResource 子类，暴露 filename 让 RestTemplate 输出 Content-Disposition 的 filename。图片与封面图复用。 */
    private static final class ImageByteArrayResource extends ByteArrayResource {
        private final String filename;

        ImageByteArrayResource(byte[] bytes, String filename) {
            super(bytes);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }
}
