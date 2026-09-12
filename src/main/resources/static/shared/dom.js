// 通用 DOM 小工具：状态文案与认证徽标。
export function showState(el, message) {
  el.textContent = message || "";
}

// 认证用户小蓝标（无文本，仅 aria 标签）
export function createVerifiedBadge() {
  const badge = document.createElement("span");
  badge.className = "verified-badge";
  badge.setAttribute("aria-label", "认证用户");
  return badge;
}
