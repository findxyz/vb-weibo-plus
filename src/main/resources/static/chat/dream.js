// 盗梦空间彩蛋：每个群友的梦境页面按用户 id 放在 /chat/dream/<uid>.html，
// 悬停头像 3 秒后探测该页面，存在才弹出入口提示；弹层保持显示，直到点击
// 自身的关闭按钮、进入游戏或滚动消息，确认后以蒙版对话框打开游戏。
export function createDream({messages, popover, enterButton, popoverClose, dialog, frame, closeButton}) {
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
    // 原生 dialog 渲染在浏览器顶层，任何 z-index 都盖不过它，
    // 弹窗（如聊天记录搜索结果）里的头像不触发彩蛋
    if (avatar?.closest?.("dialog[open]")) return null;
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
    // 带时间戳绕过浏览器缓存：游戏页是动态设置的 src，强刷外层页面管不到它
    frame.src = `${dreamUrl}?v=${Date.now()}`;
    dialog.showModal();
    // showModal 默认聚焦标题栏的关闭按钮，回车会误关弹窗；
    // 把焦点交给 iframe，键盘操作才能进游戏
    frame.focus();
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
  popoverClose.addEventListener("click", hidePopover);
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
    // 弹层出现后不再跟随指针移动收起，否则鼠标从头像移向弹层时
    // 会穿过两者之间的间隙被误收，根本点不到按钮
    if (!popover.hidden) return;
    const to = event.relatedTarget;
    const avatar = hoverableAvatar(event.target);
    if (!avatar || (to && avatar.contains(to))) return;
    hidePopover();
  });
}
