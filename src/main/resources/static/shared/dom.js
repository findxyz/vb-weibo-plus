// 通用 DOM 小工具：元素句柄挑选、状态文案与认证徽标。

// 各工厂只收自己用到的元素句柄：按工厂签名里的名单从整包 elements 里挑子集
export function pickElements(elements, ...keys) {
  return Object.fromEntries(keys.map(key => [key, elements[key]]));
}

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
