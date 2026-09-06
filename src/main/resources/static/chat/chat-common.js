export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function compareMessages(left, right) {
  return left.createdAt - right.createdAt || left.mid - right.mid;
}

export function captureScrollAnchor(container) {
  const containerTop = container.getBoundingClientRect().top;
  const anchor = [...container.children].find(element =>
    element.getBoundingClientRect().bottom > containerTop);
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
