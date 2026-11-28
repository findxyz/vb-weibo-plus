import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekdays,
  CalendarWeeks,
} from '@ui-sdk/react/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select';
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Calendar as CalendarData } from './queries';

function lastDayOfMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, '0')}`;
}

export default function DateCalendar({
  months,
  date,
  reveal,
  onSelectDate,
}: {
  months: CalendarData['months'];
  date: string;
  reveal?: { mblogId: string; version: number };
  onSelectDate: (date: string) => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  useEffect(() => {
    setMonth(date.slice(0, 7));
  }, [date, reveal]);

  const year = Number(month.slice(0, 4));
  const monthPart = month.slice(5);
  const firstMonth = months.at(-1)?.month ?? date.slice(0, 7);
  const lastMonth = months[0]?.month ?? date.slice(0, 7);
  const firstYear = Math.min(Number(firstMonth.slice(0, 4)), Number(date.slice(0, 4)));
  const lastYear = Math.max(Number(lastMonth.slice(0, 4)), Number(date.slice(0, 4)));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  const yearItems = years.map((value) => ({ value: String(value), label: `${value} 年` }));
  const monthItems = Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    return { value, label: `${index + 1} 月` };
  });

  const availableMap = new Map<string, number>();
  for (const item of months) {
    for (const day of item.days) {
      availableMap.set(day.date, day.count);
    }
  }

  return (
    <Calendar
      className="date-calendar"
      locale="zh-CN"
      weekStartsOn={1}
      weekdayFormat="narrow"
      showOutsideDays={false}
      value={date}
      month={month}
      onMonthChange={setMonth}
      min={`${firstMonth}-01`}
      max={lastDayOfMonth(lastMonth)}
      unavailable={(iso) => !availableMap.has(iso)}
      onValueChange={(next) => {
        if (typeof next === 'string' && availableMap.has(next)) onSelectDate(next);
      }}
    >
      <CalendarHeading className="sr-only" />
      <div className="calendar-navigation">
        <CalendarPrevious aria-label="上个月">
          <ChevronLeftIcon aria-hidden="true" />
        </CalendarPrevious>
        <Select
          items={yearItems}
          value={String(year)}
          onValueChange={(next) => {
            if (next) setMonth(`${next}-${monthPart}`);
          }}
        >
          <SelectTrigger aria-label="选择年份">
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {yearItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={monthItems}
          value={monthPart}
          onValueChange={(next) => {
            if (next) setMonth(`${year}-${next}`);
          }}
        >
          <SelectTrigger aria-label="选择月份">
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {monthItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CalendarNext aria-label="下个月">
          <ChevronRightIcon aria-hidden="true" />
        </CalendarNext>
      </div>
      <CalendarGrid className="calendar-grid" aria-label={`${month} 日历`}>
        <CalendarWeekdays className="calendar-weekdays" />
        <CalendarWeeks>
          {(cell) => {
            const count = availableMap.get(cell.date);
            return (
              <CalendarDay
                key={cell.date}
                value={cell.date}
                className="date-item"
                aria-label={cell.date}
                title={count ? `${cell.date}，${count} 条微博` : `${cell.date}，无微博`}
                onClick={() => {
                  if (count && cell.date === date) onSelectDate(cell.date);
                }}
                onKeyDown={(event) => {
                  if (
                    count &&
                    cell.date === date &&
                    !event.altKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault();
                    onSelectDate(cell.date);
                  }
                }}
              >
                {Number(cell.date.slice(8))}
                {count ? <span className="calendar-dot" aria-hidden="true" /> : null}
              </CalendarDay>
            );
          }}
        </CalendarWeeks>
      </CalendarGrid>
    </Calendar>
  );
}
