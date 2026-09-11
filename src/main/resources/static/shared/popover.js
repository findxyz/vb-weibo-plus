// 通用浮层工具：定位与关闭两个可独立使用的能力。
// 定位负责把弹层贴到锚点附近并夹取在视口内；
// 关闭负责「点击弹层与触发入口之外的地方」与 Escape 两种 dismissal。

/**
 * 把弹层定位到锚点附近。需在弹层已取消 hidden 后调用（测量依赖可见尺寸）。
 * @param {HTMLElement} popover position:fixed 的弹层元素
 * @param {Element} anchor 定位参照元素
 * @param {object} [options]
 * @param {"left"|"center"} [options.align] 水平对齐：左缘贴锚点左缘，或相对锚点居中
 * @param {number} [options.gap] 与锚点的间距
 * @param {number} [options.margin] 与视口边缘的最小间距
 * @param {"below"|"above"} [options.prefer] 垂直优先方向，放不下时翻到另一侧
 */
export function positionPopover(popover, anchor, {align = "center", gap = 8, margin = 8, prefer = "below"} = {}) {
  const rect = anchor.getBoundingClientRect();
  const pop = popover.getBoundingClientRect();
  let left = align === "center" ? rect.left + rect.width / 2 - pop.width / 2 : rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - pop.width - margin));
  let top;
  if (prefer === "below") {
    top = rect.bottom + gap;
    if (top + pop.height > window.innerHeight - margin) top = rect.top - pop.height - gap;
  } else {
    top = rect.top - pop.height - gap;
    if (rect.top < pop.height + gap + margin) top = rect.bottom + gap;
  }
  top = Math.max(margin, top);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

/**
 * 挂载「外点关闭 + Escape 关闭」。close 只在弹层可见且点击不在豁免范围时被调用。
 * @param {HTMLElement} popover 受管弹层
 * @param {() => void} close 关闭回调
 * @param {object} [options]
 * @param {string} [options.ignoreClosest] 点击目标命中该选择器时不关闭（如触发入口自身）
 * @returns {() => void} 解绑函数
 */
export function attachDismiss(popover, close, {ignoreClosest = null} = {}) {
  const onDocumentClick = event => {
    if (popover.hidden) return;
    if (popover.contains(event.target)) return;
    if (ignoreClosest && event.target.closest?.(ignoreClosest)) return;
    close();
  };
  const onKeydown = event => {
    if (event.key === "Escape" && !popover.hidden) close();
  };
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
  return () => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeydown);
  };
}
