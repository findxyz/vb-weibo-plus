// post 页内通用小工具：状态文案、日期校验、认证徽标、时间格式与统一接口错误分流。
// 单一调用方的逻辑不放在这里（如搜索跳转的时区日期换算在 search.js 内）。
import {pad} from "../shared/date.js";

export function showState(el, message) {
  el.textContent = message || "";
}

// 起止日期都已填时校验先后顺序
export function isDateRangeValid(start, end) {
  return !(start && end && start > end);
}

// 认证用户小蓝标（无文本，仅 aria 标签）
export function createVerifiedBadge() {
  const badge = document.createElement("span");
  badge.className = "verified-badge";
  badge.setAttribute("aria-label", "认证用户");
  return badge;
}

// 列表展示用的本地时区格式（YYYY-MM-DD HH:mm）
export function formatDate(epochMillis) {
  if (!epochMillis) return "";
  const d = new Date(epochMillis);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 统一处理接口错误：登录失效时展示登录过期提示并返回 true，其余错误交给调用方处理
export function createApiErrorHandler(onUnauthorized) {
  return function handleApiError(error, onError) {
    if (error.status === 401) {
      onUnauthorized();
      return true;
    }
    onError(error);
    return false;
  };
}
