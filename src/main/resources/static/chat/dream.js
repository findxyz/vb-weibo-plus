// 盗梦空间彩蛋：每个群友的梦境页面按用户 id 放在 /chat/dream/<uid>.html，
// 悬停头像 3 秒后探测该页面，存在才弹出入口提示，确认后以蒙版对话框打开游戏。
export function createDream({messages, popover, enterButton, dialog, frame, closeButton}) {
  const HOVER_OPEN_MS = 3000;
  let hoverTimer = null;
  let anchor = null;
  let dreamUrl = "";

  function dreamPageUrl(uid) {
    return `/chat/dream/${uid}.html`;
  }

  function hoverableAvatar(target) {
    const avatar = target?.closest?.("[data-sender-id]");
    const uid = Number(avatar?.dataset.senderId);
    return Number.isSafeInteger(uid) && uid > 0 ? avatar : null;
  }

  function cancelHover() {
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function hidePopover() {
    cancelHover();
    anchor = null;
    popover.hidden = true;
  }

  function positionPopover(avatar) {
    const rect = avatar.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - popoverRect.width / 2, 8),
      window.innerWidth - popoverRect.width - 8);
    const top = rect.top > popoverRect.height + 12
      ? rect.top - popoverRect.height - 8
      : rect.bottom + 8;
    popover.style.left = `${Math.round(Math.max(left, 8))}px`;
    popover.style.top = `${Math.round(Math.max(top, 8))}px`;
  }

  function openGame() {
    hidePopover();
    frame.src = dreamUrl;
    dialog.showModal();
  }

  function closeGame() {
    dialog.close();
  }

  dialog.addEventListener("close", () => {
    // 置为 about:blank 停掉游戏循环与音乐；置空串反而会让 iframe 回退加载首页
    frame.src = "about:blank";
  });
  closeButton.addEventListener("click", closeGame);
  enterButton.addEventListener("click", openGame);
  messages.addEventListener("scroll", hidePopover, {passive: true});

  document.addEventListener("pointerover", event => {
    if (!popover.hidden && event.target.closest?.("#dream-popover")) return;
    const avatar = hoverableAvatar(event.target);
    if (!avatar || avatar === anchor) return;
    cancelHover();
    anchor = avatar;
    hoverTimer = setTimeout(async () => {
      hoverTimer = null;
      const uid = avatar.dataset.senderId;
      dreamUrl = dreamPageUrl(uid);
      const page = await fetch(dreamUrl).catch(() => null);
      // 悬停可能在探测期间被打断（hidePopover 会清掉 anchor）
      if (anchor !== avatar) return;
      if (!page || !page.ok) {
        // 探测失败时顺手收掉可能残留的上一任弹层
        popover.hidden = true;
        return;
      }
      popover.hidden = false;
      positionPopover(avatar);
    }, HOVER_OPEN_MS);
  });

  document.addEventListener("pointerout", event => {
    const from = event.target;
    const to = event.relatedTarget;
    const avatar = hoverableAvatar(from);
    if (avatar) {
      if (to && avatar.contains(to)) return;
      if (!popover.hidden && to?.closest?.("#dream-popover")) return;
      hidePopover();
      return;
    }
    if (!popover.hidden && from.closest?.("#dream-popover")) {
      if (hoverableAvatar(to) === anchor) return;
      hidePopover();
    }
  });

  document.addEventListener("pointerdown", event => {
    if (popover.hidden) return;
    if (event.target.closest?.("#dream-popover")) return;
    hidePopover();
  });
}
