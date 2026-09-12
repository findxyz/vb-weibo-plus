import {positionPopover} from "../shared/popover.js";

// 盗梦空间彩蛋：每个群友的梦境页面按用户 id 放在 /chat/dream/<uid>.html，
// 悬停头像 3 秒后探测该页面，存在才弹出入口提示；弹层保持显示，直到点击
// 自身的关闭按钮、进入游戏或滚动消息，确认后以蒙版对话框打开游戏。
export function createDream({
  elements: {
    messages, dreamPopover: popover, dreamEnter: enterButton, dreamPopoverClose: popoverClose,
    dreamDialog: dialog, dreamFrame: frame, dreamClose: closeButton}}) {
  const HOVER_OPEN_MS = 3000;
  let hoverTimer = null;
  let anchor = null;
  let dreamUrl = "";
  // 已确认存在梦境页的 uid：反复悬停同一头像不再重复下载整页探测
  const confirmedUids = new Set();

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
      if (!confirmedUids.has(uid)) {
        const page = await fetch(dreamUrl).catch(() => null);
        // 悬停可能在探测期间被打断（hidePopover 会清掉 anchor）
        if (anchor !== avatar) return;
        if (!page || !page.ok) {
          // 探测失败时顺手收掉可能残留的上一任弹层
          popover.hidden = true;
          return;
        }
        confirmedUids.add(uid);
      }
      popover.hidden = false;
      positionPopover(popover, avatar, {gap: 8, prefer: "above"});
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
