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
      for (const [phrase, url] of Object.entries(getWeiboEmojiMap())) {
        const image = document.createElement("img");
        image.className = "emoji-cell";
        image.src = url;
        image.alt = phrase;
        image.title = phrase;
        image.loading = "lazy";
        emojiPanelGrid.append(image);
      }
      built = true;
    }
    emojiPanel.hidden = !open;
  }

  emojiPickerOpen.addEventListener("click", () => toggle());
  emojiPanelGrid.addEventListener("click", event => {
    const cell = event.target.closest(".emoji-cell");
    if (cell) insertAtCursor(cell.alt);
  });
  attachDismiss(emojiPanel, () => toggle(false), {ignoreClosest: "#emoji-picker-open"});
}
