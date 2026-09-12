// 跨页面共用的本地日期时间工具：日期一律按本地时区的 YYYY-MM-DD 处理，
// 起止时间按后端约定的「YYYY-MM-DD HH:mm:ss」格式拼接。
export function pad(value) {
  return String(value).padStart(2, "0");
}

// 起止日期都已填时校验先后顺序
export function isDateRangeValid(start, end) {
  return !(start && end && start > end);
}

// 列表展示用的本地时区格式（YYYY-MM-DD HH:mm）
export function formatDate(epochMillis) {
  if (!epochMillis) return "";
  const d = new Date(epochMillis);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// date 输入框需要的本地日期格式（YYYY-MM-DD）
export function localDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toQueryDateTime(dateStr) {
  return dateStr ? `${dateStr} 00:00:00` : null;
}

export function toQueryEndTime(dateStr) {
  return dateStr ? `${dateStr} 23:59:59` : null;
}

// 日历上倒退 N 个月，超出目标月天数时收敛到月末
export function calendarMonthsAgo(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}
