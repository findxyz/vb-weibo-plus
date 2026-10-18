import { useEffect, useState } from 'react';
import type { Calendar } from './queries';

export default function DateCalendar({ months, date, reveal, onSelectDate }: {
  months: Calendar['months']; date: string; reveal?: { mblogId: string; version: number }; onSelectDate: (date: string) => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  useEffect(() => { setMonth(date.slice(0, 7)); }, [date, reveal]);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  const firstMonth = months.at(-1)?.month ?? date.slice(0, 7);
  const lastMonth = months[0]?.month ?? date.slice(0, 7);
  const firstYear = Math.min(Number(firstMonth.slice(0, 4)), Number(date.slice(0, 4)));
  const lastYear = Math.max(Number(lastMonth.slice(0, 4)), Number(date.slice(0, 4)));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  const days = months.find(item => item.month === month)?.days ?? [];
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Math.ceil((offset + count) / 7) * 7;

  function moveMonth(direction: number) {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + direction, 1)).toISOString().slice(0, 7));
  }

  return <div className="date-calendar">
    <div className="calendar-navigation">
      <button type="button" aria-label="上个月" disabled={month <= firstMonth} onClick={() => moveMonth(-1)}>‹</button>
      <span className="select-wrap">
        <select aria-label="选择年份" value={year} onChange={event => setMonth(`${event.target.value}-${month.slice(5)}`)}>
          {years.map(value => <option key={value} value={value}>{value} 年</option>)}
        </select>
        <span className="select-value" aria-hidden="true">{year} 年</span>
        <span className="select-arrow" aria-hidden="true" />
      </span>
      <span className="select-wrap">
        <select aria-label="选择月份" value={month.slice(5)} onChange={event => setMonth(`${year}-${event.target.value}`)}>
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map(value => <option key={value} value={value}>{Number(value)} 月</option>)}
        </select>
        <span className="select-value" aria-hidden="true">{Number(month.slice(5))} 月</span>
        <span className="select-arrow" aria-hidden="true" />
      </span>
      <button type="button" aria-label="下个月" disabled={month >= lastMonth} onClick={() => moveMonth(1)}>›</button>
    </div>
    <div className="calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid" role="group" aria-label={`${month} 日历`}>
      {Array.from({ length: cells }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > count) return <span className="calendar-blank" key={index} />;
        const value = `${month}-${String(day).padStart(2, '0')}`;
        const entry = days.find(item => item.date === value);
        return <button type="button" key={index} className="date-item" aria-label={value} aria-pressed={date === value}
          title={entry ? `${value}，${entry.count} 条微博` : `${value}，无微博`} disabled={!entry} onClick={() => onSelectDate(value)}>
          {day}{entry && <span className="calendar-dot" aria-hidden="true" />}
        </button>;
      })}
    </div>
  </div>;
}
