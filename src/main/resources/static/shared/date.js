// 跨页面共用的本地日期时间工具：日期一律按本地时区的 YYYY-MM-DD 处理，
// 起止时间按后端约定的「YYYY-MM-DD HH:mm:ss」格式拼接。
//
// 时区口径（统一约定，两处取值不许混用）：
// - 与后端日期边界耦合的一切取值——post 页博文展示、搜索跳转、时间轴与弹窗
//   默认日期、chat 页历史/分析的查询默认值——统一按 Asia/Shanghai（后端对
//   start/end 参数与日历分组均按此时区解释，缺省按本地算会跨午夜错一天）。
// - chat 气泡上的消息时间（message-view 的 formatTime）保持浏览器本地显示：
//   它只做展示、不与任何查询耦合，realtime 场景本地时间更符合直觉。
export function pad(value) {
  return String(value).padStart(2, "0");
}

const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

// 把 epoch 毫秒平移到上海时区后按 UTC 字段取值，得到上海时区的年月日时分
function epochToShanghai(epochMillis) {
  const d = new Date(epochMillis + SHANGHAI_OFFSET_MS);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes()
  };
}

// 列表展示用的上海时区格式（YYYY-MM-DD HH:mm）
export function formatDate(epochMillis) {
  if (!epochMillis) return "";
  const p = epochToShanghai(epochMillis);
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
}

// 上海时区的今天（YYYY-MM-DD），作为查询区间的「今天」锚点使用
export function shanghaiToday() {
  const p = epochToShanghai(Date.now());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// epoch 毫秒对应的上海时区日期（YYYY-MM-DD），搜索跳转按博文时间定目标日期
export function epochToShanghaiDate(epochMillis) {
  const p = epochToShanghai(epochMillis);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// 起止日期都已填时校验先后顺序
export function isDateRangeValid(start, end) {
  return !(start && end && start > end);
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
