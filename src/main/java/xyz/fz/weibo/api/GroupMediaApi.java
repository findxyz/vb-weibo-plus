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
import xyz.fz.weibo.client.WeiboConstants;
import xyz.fz.weibo.client.WeiboHttpClient;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.model.request.GroupMediaRequest;
import xyz.fz.weibo.model.request.GroupMediaUploadInitRequest;
import xyz.fz.weibo.model.response.GroupMediaUploadInitResponse;
import xyz.fz.weibo.model.response.GroupMediaUploadResponse;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 群聊媒体接口：msget 下载 + 图片上传（init/uploadx）。
 * <p>
 * 下载返回 byte[] 响应，透传 Content-Type / Content-Disposition 等响应头；
 * 上传为群聊发送图片的两步（init 初始化、uploadx 上传文件）。
 */
@Component
public class GroupMediaApi {

    private static final String GROUP_MEDIA_URL = "https://upload.api.weibo.com/2/mss/msget";
    private static final String INIT_UPLOAD_URL = "https://api.weibo.com/webim/fileplatform/init.json";
    private static final String UPLOAD_URL = "https://api.weibo.com/webim/uploadx.json";

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
            byte[] chunk = java.util.Arrays.copyOfRange(bytes, startloc, end);
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

    /** ByteArrayResource 子类，暴露 filename 让 RestTemplate 输出 Content-Disposition 的 filename。 */
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
