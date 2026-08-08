package xyz.fz.weibo.service;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import xyz.fz.weibo.client.AiClient;
import xyz.fz.weibo.domain.AnalysisPageResult;
import xyz.fz.weibo.domain.AnalysisSummary;
import xyz.fz.weibo.domain.AnalysisView;
import xyz.fz.weibo.entity.AnalysisEntity;
import xyz.fz.weibo.entity.MessageEntity;
import xyz.fz.weibo.repository.AnalysisRepository;
import xyz.fz.weibo.repository.MessageRepository;
import xyz.fz.weibo.service.exception.InvalidRequestException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.function.Consumer;

/**
 * 群聊分析：取本地消息拼接后调 AI 分析，结果存库。
 */
@Service
public class AnalysisService {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MessageRepository messageRepository;
    private final AnalysisRepository analysisRepository;
    private final AiClient aiClient;

    public AnalysisService(MessageRepository messageRepository, AnalysisRepository analysisRepository, AiClient aiClient) {
        this.messageRepository = messageRepository;
        this.analysisRepository = analysisRepository;
        this.aiClient = aiClient;
    }

    public AnalysisView analyze(long gid, LocalDate date, String prompt) {
        PreparedAnalysis prepared = prepare(gid, date, prompt);
        String result = aiClient.chat(prepared.promptText());
        return save(gid, prepared, result);
    }

    /**
     * 流式分析：AI 生成的增量文本通过 deltaConsumer 逐段回调，完成后存库。
     */
    public AnalysisView analyzeStreaming(long gid, LocalDate date, String prompt, Consumer<String> deltaConsumer) {
        PreparedAnalysis prepared = prepare(gid, date, prompt);
        String result = aiClient.chatStream(prepared.promptText(), deltaConsumer);
        return save(gid, prepared, result);
    }

    private record PreparedAnalysis(long dateMillis, String rawPrompt, String promptText, int messageCount) {
    }

    private PreparedAnalysis prepare(long gid, LocalDate date, String prompt) {
        validateGid(gid);
        if (date == null) {
            throw new InvalidRequestException("date 不能为空。");
        }
        if (prompt == null || prompt.isBlank()) {
            throw new InvalidRequestException("prompt 不能为空。");
        }

        long startMillis = date.atStartOfDay(ZONE).toInstant().toEpochMilli();
        long endMillis = date.plusDays(1).atStartOfDay(ZONE).toInstant().toEpochMilli() - 1;

        List<MessageEntity> messages = messageRepository.findPage(
                gid, startMillis, endMillis, null, null,
                MessageRepository.pageRequest(1, Integer.MAX_VALUE)
        ).getContent();

        if (messages.isEmpty()) {
            throw new InvalidRequestException("该日期无本地消息，请先同步。");
        }

        String promptText = prompt + "\n\n以下是群聊消息：\n\n" + buildMessageText(messages);
        return new PreparedAnalysis(startMillis, prompt, promptText, messages.size());
    }

    private AnalysisView save(long gid, PreparedAnalysis prepared, String result) {
        AnalysisEntity entity = new AnalysisEntity(
                gid, prepared.dateMillis(), prepared.rawPrompt(), result,
                prepared.messageCount(), System.currentTimeMillis());
        AnalysisEntity saved = analysisRepository.save(entity);
        return toView(saved);
    }

    public AnalysisPageResult list(long gid, int page, int size) {
        validateGid(gid);
        validatePage(page, size);

        Page<AnalysisEntity> result = analysisRepository.findPage(gid, AnalysisRepository.pageRequest(page, size));
        List<AnalysisSummary> items = result.getContent().stream()
                .map(this::toSummary)
                .toList();
        return new AnalysisPageResult(items, page, size, result.getTotalElements());
    }

    public AnalysisView get(long id) {
        AnalysisEntity entity = analysisRepository.findById(id)
                .orElseThrow(() -> new InvalidRequestException("分析记录不存在。"));
        return toView(entity);
    }

    private String buildMessageText(List<MessageEntity> messages) {
        StringBuilder sb = new StringBuilder();
        for (MessageEntity msg : messages) {
            String time = Instant.ofEpochMilli(msg.getCreatedAt())
                    .atZone(ZONE)
                    .toLocalTime()
                    .format(DateTimeFormatter.ofPattern("HH:mm"));
            String sender = msg.getSenderName() != null ? msg.getSenderName() : "未知";
            String text = msg.getText();
            if (text == null || text.isBlank()) {
                String typeName = msg.getMsgTypeName();
                text = typeName != null && !typeName.isBlank() ? "[" + typeName + "]" : "[非文本消息]";
            }
            sb.append("[").append(time).append("] ").append(sender).append(": ").append(text).append("\n");
        }
        return sb.toString();
    }

    private AnalysisView toView(AnalysisEntity entity) {
        String dateStr = Instant.ofEpochMilli(entity.getDate()).atZone(ZONE).toLocalDate().format(DATE_FMT);
        String createdAtStr = Instant.ofEpochMilli(entity.getCreatedAt()).atZone(ZONE).format(DATETIME_FMT);
        return new AnalysisView(
                entity.getId(),
                entity.getGid(),
                dateStr,
                entity.getPrompt(),
                entity.getResult(),
                entity.getMessageCount(),
                createdAtStr
        );
    }

    private AnalysisSummary toSummary(AnalysisEntity entity) {
        String dateStr = Instant.ofEpochMilli(entity.getDate()).atZone(ZONE).toLocalDate().format(DATE_FMT);
        String createdAtStr = Instant.ofEpochMilli(entity.getCreatedAt()).atZone(ZONE).format(DATETIME_FMT);
        return new AnalysisSummary(entity.getId(), dateStr, entity.getPrompt(), entity.getMessageCount(), createdAtStr);
    }

    private void validateGid(long gid) {
        if (gid <= 0) {
            throw new InvalidRequestException("gid 必须大于 0。");
        }
    }

    private void validatePage(int page, int size) {
        if (page < 1) {
            throw new InvalidRequestException("page 必须大于等于 1。");
        }
        if (size < 1 || size > 100) {
            throw new InvalidRequestException("size 必须介于 1 和 100 之间。");
        }
    }
}
