// 关键词高亮的 DOM 版实现：大小写不敏感地把命中片段包进 <mark>。
// 只操作文本节点与元素，不走字符串拼接 + innerHTML，天然免疫转义遗漏。

/**
 * 把 value 写入 element，命中关键词的片段用 <mark> 包裹。
 * @param {Element} element 目标容器（调用前自行清空）
 * @param {string} value 原始文本
 * @param {string} keyword 关键词，大小写不敏感
 * @param {object} [options]
 * @param {number} [options.max] 最多标记的命中数，默认全部标记
 */
export function appendHighlightedText(element, value, keyword, {max = Infinity} = {}) {
  const text = value || "", needle = keyword?.trim() || "";
  if (!needle) { element.textContent = text; return; }
  const lowerText = text.toLocaleLowerCase(), lowerNeedle = needle.toLocaleLowerCase();
  let start = 0, match = lowerText.indexOf(lowerNeedle), marked = 0;
  while (match >= 0 && marked < max) {
    element.append(document.createTextNode(text.slice(start, match)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(match, match + needle.length);
    element.append(mark);
    marked += 1;
    start = match + needle.length;
    match = lowerText.indexOf(lowerNeedle, start);
  }
  element.append(document.createTextNode(text.slice(start)));
}
