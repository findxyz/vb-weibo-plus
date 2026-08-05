package xyz.fz.weibo.domain;

import java.util.List;

public record CalendarView(
        List<MonthGroup> months
) {
    public record MonthGroup(
            String month,
            long count,
            List<DayCount> days
    ) {
    }

    public record DayCount(
            String date,
            long count
    ) {
    }
}
