// 表情面板：首次打开时按微博表情映射懒构建网格，点击表情插入输入框光标处；
// 面板关闭走「外点 + Escape」dismiss，触发按钮自身豁免。
import {attachDismiss} from "../shared/popover.js";

export function createEmojiPanel({
  elements: {emojiPickerOpen, emojiPanel, emojiPanelGrid, composer},
  getWeiboEmojiMap}) {
  let built = false;

  function insertAtCursor(phrase) {
    const start = composer.selectionStart ?? composer.value.length;
    const end = composer.selectionEnd ?? composer.value.length;
    composer.setRangeText(phrase, start, end, "end");
    composer.focus();
    composer.dispatchEvent(new Event("input", {bubbles: true}));
  }

  function toggle(forceOpen) {
    const open = forceOpen ?? emojiPanel.hidden;
    if (open && !built) {
      // 格子是按钮：键盘 Tab 可达，Enter/Space 插入
      for (const [phrase, url] of Object.entries(getWeiboEmojiMap())) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "emoji-cell";
        cell.dataset.phrase = phrase;
        cell.title = phrase;
        const image = document.createElement("img");
        image.src = url;
        image.alt = phrase;
        image.loading = "lazy";
        cell.append(image);
        emojiPanelGrid.append(cell);
      }
      built = true;
    }
    emojiPanel.hidden = !open;
    if (open) {
      emojiPanelGrid.querySelector("button")?.focus();
    } else if (emojiPanelGrid.contains(document.activeElement)) {
      // 关闭时焦点还到触发钮；外点关闭时焦点已在别处，不抢
      emojiPickerOpen.focus();
    }
  }

  emojiPickerOpen.addEventListener("click", () => toggle());
  emojiPanelGrid.addEventListener("click", event => {
    const cell = event.target.closest(".emoji-cell");
    if (cell) insertAtCursor(cell.dataset.phrase);
  });
  attachDismiss(emojiPanel, () => toggle(false), {ignoreClosest: "#emoji-picker-open"});
}
