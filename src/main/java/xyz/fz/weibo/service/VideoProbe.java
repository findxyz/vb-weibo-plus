package xyz.fz.weibo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.exception.WeiboException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 从视频提取封面图（PNG）并探测属性（宽/高/时长），用于群聊发送视频。
 * <p>
 * 依赖系统 ffmpeg（加入 PATH 或配置 weibo.media.ffmpeg-path），与 HeicConverter 共用同一配置项。
 * 网页端约束：MP4、时长小于 5 分钟、文件小于 100 MB，本类在探测后校验时长上限。
 */
@Component
public class VideoProbe {

    private static final Logger log = LoggerFactory.getLogger(VideoProbe.class);
    private static final int MAX_DURATION_SECONDS = 300;

    private final String ffmpegPath;
    private final ObjectMapper objectMapper;
    private volatile boolean ffmpegAvailable;

    public VideoProbe(@Value("${weibo.media.ffmpeg-path:ffmpeg}") String ffmpegPath,
                      ObjectMapper objectMapper) {
        this.ffmpegPath = ffmpegPath;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void init() {
        ffmpegAvailable = probeFfmpeg();
        if (!ffmpegAvailable) {
            log.warn("未检测到 ffmpeg（{}），无法发送视频。"
                    + "请安装 ffmpeg 并加入 PATH，或配置环境变量 WEIBO_FFMPEG_PATH。", ffmpegPath);
        }
    }

    public record ProbeResult(byte[] coverPng, int width, int height, int duration) {
    }

    /**
     * 探测视频属性并提取封面图。ffmpeg 不可用或视频不合法时抛 WeiboException，不降级。
     */
    public ProbeResult probe(byte[] videoBytes) {
        if (!ffmpegAvailable) {
            throw new WeiboException("未检测到 ffmpeg，无法发送视频。请安装 ffmpeg 并加入 PATH。", -1);
        }
        Path input = null;
        try {
            input = Files.createTempFile("weibo-video-", ".mp4");
            Files.write(input, videoBytes);
            int[] dims = probeDimensions(input);
            int width = dims[0];
            int height = dims[1];
            int duration = probeDuration(input);
            if (width <= 0 || height <= 0) {
                throw new WeiboException("视频属性探测失败：宽高非法。", -1);
            }
            if (duration <= 0) {
                throw new WeiboException("视频属性探测失败：时长非法。", -1);
            }
            if (duration > MAX_DURATION_SECONDS) {
                throw new WeiboException("视频时长超过 5 分钟限制。", -1);
            }
            byte[] cover = extractCover(input);
            if (cover.length == 0) {
                throw new WeiboException("视频封面提取失败：未得到封面图数据。", -1);
            }
            return new ProbeResult(cover, width, height, duration);
        } catch (IOException | InterruptedException e) {
            throw new WeiboException("视频属性探测失败：" + e.getMessage(), -1, e);
        } finally {
            deleteQuietly(input);
        }
    }

    private int[] probeDimensions(Path input) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                ffprobeCommand(input, "stream=width,height"))
                .redirectErrorStream(true)
                .start();
        String output = new String(process.getInputStream().readAllBytes());
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new WeiboException("视频属性探测超时。", -1);
        }
        if (process.exitValue() != 0) {
            throw new WeiboException("视频属性探测失败：ffprobe 退出码 " + process.exitValue() + "。", -1);
        }
        try {
            JsonNode root = objectMapper.readTree(output);
            JsonNode stream = root != null && root.has("streams") ? root.get("streams").get(0) : null;
            if (stream == null) {
                throw new WeiboException("视频属性探测失败：无流信息。", -1);
            }
            return new int[]{
                    stream.path("width").asInt(0),
                    stream.path("height").asInt(0)
            };
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException("视频属性探测失败：解析 ffprobe 输出失败。", -1, e);
        }
    }

    private int probeDuration(Path input) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                ffprobeCommand(input, "format=duration"))
                .redirectErrorStream(true)
                .start();
        String output = new String(process.getInputStream().readAllBytes());
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new WeiboException("视频时长探测超时。", -1);
        }
        if (process.exitValue() != 0) {
            throw new WeiboException("视频时长探测失败：ffprobe 退出码 " + process.exitValue() + "。", -1);
        }
        try {
            JsonNode root = objectMapper.readTree(output);
            JsonNode format = root != null && root.has("format") ? root.get("format") : null;
            if (format == null) {
                throw new WeiboException("视频时长探测失败：无 format 信息。", -1);
            }
            return (int) Math.round(format.path("duration").asDouble(0));
        } catch (WeiboException e) {
            throw e;
        } catch (Exception e) {
            throw new WeiboException("视频时长探测失败：解析 ffprobe 输出失败。", -1, e);
        }
    }

    private byte[] extractCover(Path input) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(List.of(
                ffmpegPath, "-hide_banner", "-loglevel", "error", "-y",
                "-i", input.toString(),
                "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png",
                "-"))
                .redirectErrorStream(false)
                .start();
        byte[] cover = process.getInputStream().readAllBytes();
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new WeiboException("视频封面提取超时。", -1);
        }
        if (process.exitValue() != 0) {
            throw new WeiboException("视频封面提取失败：ffmpeg 退出码 " + process.exitValue() + "。", -1);
        }
        return cover;
    }

    private List<String> ffprobeCommand(Path input, String entries) {
        String ffprobePath = resolveFfprobePath();
        return List.of(
                ffprobePath, "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", entries,
                "-of", "json",
                input.toString());
    }

    /**
     * ffprobe 通常与 ffmpeg 同目录，将 ffmpeg 配置值的 basename 替换为 ffprobe。
     */
    private String resolveFfprobePath() {
        if ("ffmpeg".equals(ffmpegPath)) {
            return "ffprobe";
        }
        Path path = Path.of(ffmpegPath);
        Path parent = path.getParent();
        String ffprobe = "ffprobe" + (ffmpegPath.endsWith(".exe") ? ".exe" : "");
        return parent != null ? parent.resolve(ffprobe).toString() : ffprobe;
    }

    @SuppressWarnings("DuplicatedCode")
    private boolean probeFfmpeg() {
        try {
            Process process = new ProcessBuilder(ffmpegPath, "-version")
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    private static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 临时文件清理失败不影响主流程
        }
    }
}
