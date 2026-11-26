export function pad(value: number | string): string {
  return String(value).padStart(2, '0');
}

const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

function epochToShanghai(epochMillis: number) {
  const d = new Date(epochMillis + SHANGHAI_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}

export function formatDate(epochMillis: number | null | undefined): string {
  if (!epochMillis) return '';
  const p = epochToShanghai(epochMillis);
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
}

export function shanghaiToday(): string {
  const p = epochToShanghai(Date.now());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function epochToShanghaiDate(epochMillis: number): string {
  const p = epochToShanghai(epochMillis);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function isDateRangeValid(start: string, end: string): boolean {
  return !(start && end && start > end);
}

export function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toQueryDateTime(dateStr: string): string | null {
  return dateStr ? `${dateStr} 00:00:00` : null;
}

export function toQueryEndTime(dateStr: string): string | null {
  return dateStr ? `${dateStr} 23:59:59` : null;
}

export function calendarMonthsAgo(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}
