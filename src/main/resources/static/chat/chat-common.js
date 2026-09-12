// chat 页共享的无状态工具与协议常量：消息排序、滚动锚点、媒体类型、时间格式化。
// 谁需要谁 import，不做工厂注入。
export const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};

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

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});

export function formatTime(timestamp) { return timeFormatter.format(new Date(timestamp)); }
export function formatDateTime(timestamp) { return dateTimeFormatter.format(new Date(timestamp)); }
