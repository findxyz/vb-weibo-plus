package xyz.fz.weibo.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
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

@Component
public class GroupMediaApi {

    private static final String GROUP_MEDIA_URL = "https://upload.api.weibo.com/2/mss/msget";
    private static final String INIT_UPLOAD_URL =
            "https://api.weibo.com/webim/fileplatform/init.json";
    private static final String UPLOAD_URL = "https://api.weibo.com/webim/uploadx.json";
    private static final String VIDEO_INIT_URL =
            "https://api.weibo.com/webim/2/multimedia/init.json";
    private static final String VIDEO_UPLOAD_URL =
            "https://up.video.weibocdn.com/2/multimedia/upload.json";

    private final WeiboHttpClient client;
    private final ObjectMapper objectMapper;

    public GroupMediaApi(WeiboHttpClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<byte[]> download(GroupMediaRequest request) {
        return client.getForBytes(
                GROUP_MEDIA_URL, request.toParams(), WeiboConstants.HEADERS_MSGET, true);
    }

    public <T> T stream(
            GroupMediaRequest request,
            @SuppressWarnings("PMD.LooseCoupling") HttpHeaders callerHeaders,
            ResponseExtractor<T> responseExtractor) {
        Map<String, String> headers = new LinkedHashMap<>(callerHeaders.toSingleValueMap());
        headers.putAll(WeiboConstants.HEADERS_MSGET);
        return client.getForStream(
                GROUP_MEDIA_URL, request.toParams(), headers, true, responseExtractor);
    }

    public GroupMediaUploadInitResponse initUpload(GroupMediaUploadInitRequest request) {
        ResponseEntity<String> resp =
                client.postForm(
                        INIT_UPLOAD_URL,
                        request.toParams(),
                        WeiboConstants.HEADERS_WEBIM_SEND,
                        true);
        return deserialize(resp.getBody(), GroupMediaUploadInitResponse.class);
    }

    public GroupMediaUploadResponse upload(
            byte[] bytes, String filename, String fileToken, long gid, int chunkSizeKb) {
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
            ResponseEntity<String> resp =
                    client.postMultipart(
                            UPLOAD_URL, queryParams, body, WeiboConstants.HEADERS_WEBIM_SEND, true);
            GroupMediaUploadResponse chunkResponse =
                    deserialize(resp.getBody(), GroupMediaUploadResponse.class);
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

    public GroupMediaUploadResponse uploadCover(byte[] coverBytes, String coverName, long gid) {
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("source", WeiboConstants.SOURCE);
        queryParams.put("gid", String.valueOf(gid));
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("imageName", new ImageByteArrayResource(coverBytes, coverName));
        ResponseEntity<String> resp =
                client.postMultipart(
                        UPLOAD_URL, queryParams, body, WeiboConstants.HEADERS_WEBIM_SEND, true);
        GroupMediaUploadResponse coverResponse =
                deserialize(resp.getBody(), GroupMediaUploadResponse.class);
        if (coverResponse.fid() <= 0) {
            throw new WeiboException("视频封面上传失败：未拿到文件 id。", -1);
        }
        return coverResponse;
    }

    public GroupVideoUploadInitResponse initVideoUpload(GroupVideoInitRequest request) {
        ResponseEntity<String> resp =
                client.postForm(
                        VIDEO_INIT_URL,
                        request.toParams(),
                        WeiboConstants.HEADERS_WEBIM_SEND,
                        true);
        return deserialize(resp.getBody(), GroupVideoUploadInitResponse.class);
    }

    public GroupMediaUploadResponse uploadVideo(
            byte[] bytes,
            String filename,
            String fileToken,
            String auth,
            long gid,
            int chunkSizeKb,
            String wholeMd5) {
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
            ResponseEntity<String> resp =
                    client.postOctetStream(VIDEO_UPLOAD_URL, queryParams, chunk, headers, true);
            GroupMediaUploadResponse chunkResponse =
                    deserialize(resp.getBody(), GroupMediaUploadResponse.class);
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
