package xyz.fz.weibo.domain;

import java.time.LocalDate;

public record PostHistoryStatus(
        long uid,
        LocalDate start,
        LocalDate end,
        Phase phase,
        LocalDate currentDate,
        int fetchedCount,
        int insertedCount,
        String failureReason) {

    public enum Phase {
        PENDING,
        RUNNING,
        SUCCEEDED,
        FAILED
    }
}
