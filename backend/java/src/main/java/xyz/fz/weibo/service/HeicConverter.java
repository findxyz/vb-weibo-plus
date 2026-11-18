package xyz.fz.weibo.service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import xyz.fz.weibo.client.exception.WeiboException;
import xyz.fz.weibo.domain.MediaBinary;

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
            log.warn(
                    "未检测到 ffmpeg（{}），HEIC 群图片将原样透传且浏览器无法显示。"
                            + "请安装 ffmpeg 并加入 PATH，或配置环境变量 WEIBO_FFMPEG_PATH。",
                    ffmpegPath);
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
            List<String> command =
                    List.of(
                            ffmpegPath,
                            "-hide_banner",
                            "-loglevel",
                            "error",
                            "-y",
                            "-i",
                            input.toString(),
                            "-frames:v",
                            "1",
                            "-update",
                            "1",
                            output.toString());
            Process process =
                    new ProcessBuilder(command)
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

    @SuppressWarnings("DuplicatedCode")
    private boolean probeFfmpeg() {
        try {
            Process process =
                    new ProcessBuilder(ffmpegPath, "-version")
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
            return;
        }
    }
}
