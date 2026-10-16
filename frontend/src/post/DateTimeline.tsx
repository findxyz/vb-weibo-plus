import { useEffect, useState } from 'react';
import type { Calendar } from './queries';

export default function DateTimeline({ months, date, reveal, onSelectDate }: {
  months: Calendar['months']; date: string; reveal?: { mblogId: string; version: number }; onSelectDate: (date: string) => void;
}) {
  const [openYears, setOpenYears] = useState<string[]>([date.slice(0, 4)]);
  const [openMonths, setOpenMonths] = useState<string[]>([date.slice(0, 7)]);
  const years = [...new Set(months.map(month => month.month.slice(0, 4)))];
  useEffect(() => {
    if (!reveal) return;
    const year = date.slice(0, 4), month = date.slice(0, 7);
    setOpenYears(previous => previous.includes(year) ? previous : [...previous, year]);
    setOpenMonths(previous => previous.includes(month) ? previous : [...previous, month]);
  }, [reveal, date]);

  function toggle(values: string[], value: string) {
    return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  }

  return <div className="date-timeline">
    {years.map(year => {
      const yearMonths = months.filter(month => month.month.startsWith(`${year}-`));
      const count = yearMonths.reduce((sum, month) => sum + month.count, 0);
      const open = openYears.includes(year);
      return <div key={year} className="year-group">
        <button className="navigation-row year-header" aria-label={`${year} 年，${count} 条`}
          aria-expanded={open} aria-controls={`months-${year}`} onClick={() => setOpenYears(toggle(openYears, year))}>
          <span>{year} 年</span><span className="navigation-count">{count} 条</span>
        </button>
        <div className="year-months" id={`months-${year}`} hidden={!open}>
          {yearMonths.map(month => {
            const monthOpen = openMonths.includes(month.month);
            return <div key={month.month} className="month-group">
              <button className="navigation-row month-header" aria-label={`${month.month}，${month.count} 条`}
                aria-expanded={monthOpen} aria-controls={`days-${month.month}`} onClick={() => setOpenMonths(toggle(openMonths, month.month))}>
                <span>{month.month.slice(5)} 月</span><span className="navigation-count">{month.count} 条</span>
              </button>
              <div id={`days-${month.month}`} hidden={!monthOpen}>
                {month.days.map(day => <button key={day.date} className="navigation-row date-item"
                  aria-label={day.date} aria-pressed={date === day.date} onClick={() => onSelectDate(day.date)}>
                  <span>{day.date.slice(8)} 日</span><span className="navigation-count">{day.count}</span>
                </button>)}
              </div>
            </div>;
          })}
        </div>
      </div>;
    })}
  </div>;
}
