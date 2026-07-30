package xyz.fz.weibo.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.MediaBinary;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 将微博错标为 image/jpeg 的 HEIC 群图片转码为 JPEG，使桌面浏览器可直接显示。
 * <p>
 * 仅在检测到 HEIC magic（offset 4-7 == "ftyp" 且 brand ∈ {"heic","mif1"}）时转码，
 * 其余格式原样透传。转码依赖系统 ffmpeg（加入 PATH 或配置 weibo.media.ffmpeg-path）。
 * <p>
 * 若启动时检测不到 ffmpeg，HEIC 图片降级为原样透传（Content-Type 改为 image/heic），
 * 不会报错；此时桌面浏览器仍无法显示，但不影响其他格式图片。
 */
@Component
public class HeicConverter {

    private static final Logger log = LoggerFactory.getLogger(HeicConverter.class);

    private final String ffmpegPath;
    private volatile boolean ffmpegAvailable;

    public HeicConverter(@Value("${weibo.media.ffmpeg-path:ffmpeg}") String ffmpegPath) {
        this.ffmpegPath = ffmpegPath;
    }

    @PostConstruct
    void init() {
        ffmpegAvailable = probeFfmpeg();
        if (!ffmpegAvailable) {
            log.warn("未检测到 ffmpeg（{}），HEIC 群图片将原样透传且浏览器无法显示。"
                    + "请安装 ffmpeg 并加入 PATH，或配置环境变量 WEIBO_FFMPEG_PATH。", ffmpegPath);
        }
    }

    public MediaBinary convertIfHeic(MediaBinary source) {
        byte[] content = source.content();
        if (!isHeic(content)) {
            return source;
        }
        if (!ffmpegAvailable) {
            return new MediaBinary(content, "image/heic");
        }
        return transcode(content);
    }

    private MediaBinary transcode(byte[] content) {
        Path input = null;
        Path output = null;
        try {
            input = Files.createTempFile("weibo-heic-", ".heic");
            Files.write(input, content);
            output = Files.createTempFile("weibo-heic-out-", ".jpg");
            List<String> command = List.of(
                    ffmpegPath, "-hide_banner", "-loglevel", "error", "-y",
                    "-i", input.toString(),
                    "-frames:v", "1", "-update", "1",
                    output.toString());
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .start();
            if (!process.waitFor(30, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new WeiboException("群消息 HEIC 图片转码超时。", -1);
            }
            if (process.exitValue() != 0) {
                throw new WeiboException("群消息 HEIC 图片转码失败。", -1);
            }
            byte[] jpeg = Files.readAllBytes(output);
            if (jpeg.length == 0) {
                throw new WeiboException("群消息 HEIC 图片转码失败。", -1);
            }
            return new MediaBinary(jpeg, "image/jpeg");
        } catch (IOException | InterruptedException e) {
            throw new WeiboException("群消息 HEIC 图片转码失败。", -1, e);
        } finally {
            deleteQuietly(input);
            deleteQuietly(output);
        }
    }

    /**
     * 启动时探测 ffmpeg 是否可执行。执行 {@code ffmpeg -version}，退出码为 0 即视为可用。
     */
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

    /**
     * HEIC magic 检测：字节 4-7 为 "ftyp"，紧跟的 brand（8-11）为 heic 或 mif1。
     */
    static boolean isHeic(byte[] content) {
        if (content == null || content.length < 12) {
            return false;
        }
        if (!asciiAt(content, 4, "ftyp")) {
            return false;
        }
        return asciiAt(content, 8, "heic") || asciiAt(content, 8, "mif1");
    }

    private static boolean asciiAt(byte[] content, int offset, String expected) {
        for (int i = 0; i < expected.length(); i++) {
            if (content[offset + i] != (byte) expected.charAt(i)) {
                return false;
            }
        }
        return true;
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
