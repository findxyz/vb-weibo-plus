package xyz.fz.weibo.service;

import org.junit.jupiter.api.Test;
import xyz.fz.weibo.domain.MediaBinary;

import static org.assertj.core.api.Assertions.assertThat;

class HeicConverterTest {

    private static final byte[] JPEG = new byte[]{
            (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1};
    private static final byte[] PNG = new byte[]{
            (byte) 0x89, 'P', 'N', 'G', (byte) 0x0D, (byte) 0x0A, (byte) 0x1A, (byte) 0x0A, 0, 0, 0, 0x0D};
    private static final byte[] HEIC = heicMagic("heic");
    private static final byte[] MIF1 = heicMagic("mif1");

    private static byte[] heicMagic(String brand) {
        byte[] bytes = new byte[]{
                0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c', 0, 0, 0, 0};
        for (int i = 0; i < 4; i++) {
            bytes[8 + i] = (byte) brand.charAt(i);
        }
        return bytes;
    }

    @Test
    void detects_heic_magic() {
        assertThat(HeicConverter.isHeic(HEIC)).isTrue();
        assertThat(HeicConverter.isHeic(MIF1)).isTrue();
    }

    @Test
    void rejects_non_heic_magic() {
        assertThat(HeicConverter.isHeic(JPEG)).isFalse();
        assertThat(HeicConverter.isHeic(PNG)).isFalse();
    }

    @Test
    void rejects_null_short_or_incomplete_bytes() {
        assertThat(HeicConverter.isHeic(null)).isFalse();
        assertThat(HeicConverter.isHeic(new byte[0])).isFalse();
        assertThat(HeicConverter.isHeic(new byte[]{0, 0, 0, 0x18, 'f', 't', 'y'})).isFalse();
    }

    @Test
    void non_heic_bytes_pass_through_unchanged() {
        HeicConverter converter = newConverter("definitely-not-a-real-ffmpeg-binary");
        MediaBinary source = new MediaBinary(JPEG, "image/jpeg;charset=utf-8");

        MediaBinary result = converter.convertIfHeic(source);

        assertThat(result).isSameAs(source);
        assertThat(result.content()).isSameAs(JPEG);
        assertThat(result.contentType()).isEqualTo("image/jpeg;charset=utf-8");
    }

    @Test
    void null_and_short_content_pass_through_without_invoking_ffmpeg() {
        HeicConverter converter = newConverter("definitely-not-a-real-ffmpeg-binary");
        MediaBinary empty = new MediaBinary(new byte[0], "image/jpeg");
        MediaBinary shortBytes = new MediaBinary(new byte[]{1, 2, 3}, "image/jpeg");

        assertThat(converter.convertIfHeic(empty)).isSameAs(empty);
        assertThat(converter.convertIfHeic(shortBytes)).isSameAs(shortBytes);
    }

    @Test
    void heic_bytes_fall_back_to_passthrough_when_ffmpeg_unavailable() {
        HeicConverter converter = newConverter("definitely-not-a-real-ffmpeg-binary");

        MediaBinary result = converter.convertIfHeic(new MediaBinary(HEIC, "image/jpeg"));

        assertThat(result.content()).containsExactly(HEIC);
        assertThat(result.contentType()).isEqualTo("image/heic");
    }

    @Test
    void probe_marks_converter_unavailable_when_ffmpeg_missing() {
        HeicConverter converter = newConverter("definitely-not-a-real-ffmpeg-binary");

        converter.init();

        // 非真实 ffmpeg 时，HEIC 走降级透传而非报错
        MediaBinary result = converter.convertIfHeic(new MediaBinary(HEIC, "image/jpeg"));
        assertThat(result.contentType()).isEqualTo("image/heic");
    }

    /**
     * 构造 converter 并触发一次 ffmpeg 探测（@PostConstruct 仅在 Spring 容器中调用）。
     */
    private static HeicConverter newConverter(String ffmpegPath) {
        HeicConverter converter = new HeicConverter(ffmpegPath);
        converter.init();
        return converter;
    }
}
