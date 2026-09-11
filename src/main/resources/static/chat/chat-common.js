export function compareMessages(left, right) {
  return left.createdAt - right.createdAt || left.mid - right.mid;
}

export function captureScrollAnchor(container) {
  const containerTop = container.getBoundingClientRect().top;
  // 跳过没有消息的占位元素（如滑动窗口的顶部占位），否则贴顶时锚点会落空
  const anchor = [...container.children].find(element =>
    element.dataset.mid && element.getBoundingClientRect().bottom > containerTop);
  if (!anchor) return null;
  return {
    mid: anchor.dataset.mid,
    top: anchor.getBoundingClientRect().top
  };
}

export function restoreScrollAnchor(anchor, container) {
  if (!anchor) return;
  const renderedAnchor = container.querySelector(`[data-mid="${anchor.mid}"]`);
  if (renderedAnchor) {
    container.scrollTop += renderedAnchor.getBoundingClientRect().top - anchor.top;
  }
}
