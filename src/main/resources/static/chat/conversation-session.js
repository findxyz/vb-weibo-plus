export function createConversationSession({
  elements,
  messageView,
  fetchJson,
  compareMessages,
  captureScrollAnchor,
  restoreScrollAnchor,
  pageSize,
  earlierLoadThreshold,
  onInitialMessages,
  onEarlierMessages,
  onNewMessages
}) {
  let group = null;
  let messages = new Map();
  let version = 0;
  let beforeCursor = null;
  let hasMore = false;
  let followingLatest = true;
  let pendingCatchUp = false;
  let refreshing = false;
  let switchingGroup = false;
  let loadingEarlier = false;
  let scrollScheduled = false;

  function currentGid() {
    return group?.gid ?? null;
  }

  function setFollowing(value) {
    followingLatest = value;
    elements.followIndicator.classList.toggle("paused", !value);
    elements.followIndicator.setAttribute("aria-label", value
      ? "正在跟随最新消息"
      : "已暂停跟随最新消息，新消息不会自动滚动");
  }

  function scrollToBottom(force = false) {
    if (force || followingLatest) elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function isNearBottom() {
    return elements.messages.scrollHeight
      - elements.messages.scrollTop
      - elements.messages.clientHeight < 80;
  }

  function renderMessages(forceFollow = false) {
    const ordered = [...messages.values()].sort(compareMessages);
    const renderGid = currentGid();
    const renderVersion = version;
    const onLoad = () => {
      if (currentGid() !== renderGid || version !== renderVersion) return;
      scrollToBottom(forceFollow);
    };
    const existingByMid = new Map();
    for (const element of elements.messages.children) {
      if (element.dataset.mid) existingByMid.set(Number(element.dataset.mid), element);
    }
    const desiredMids = new Set(ordered.map(message => message.mid));
    const hasCommon = ordered.some(message => existingByMid.has(message.mid));
    if (!hasCommon) {
      elements.messages.replaceChildren(...ordered.map(message => messageView.messageElement(
        message, null, onLoad, renderGid)));
      return;
    }
    for (const [mid, element] of existingByMid) {
      if (!desiredMids.has(mid)) element.remove();
    }
    let previous = null;
    for (const message of ordered) {
      let element = existingByMid.get(message.mid);
      if (element) {
        const expectedNext = previous
          ? previous.nextElementSibling
          : elements.messages.firstElementChild;
        if (element !== expectedNext) {
          if (previous) previous.after(element);
          else elements.messages.prepend(element);
        }
      } else {
        element = messageView.messageElement(message, null, onLoad, renderGid);
        if (previous) previous.after(element);
        else elements.messages.prepend(element);
      }
      previous = element;
    }
  }

  async function loadMessages(cursor = null) {
    const latestPage = cursor === null;
    const anchor = latestPage ? null : captureScrollAnchor(elements.messages);
    const gid = currentGid();
    const requestVersion = version;
    const query = new URLSearchParams({gid: String(gid), size: String(pageSize)});
    if (!latestPage) {
      query.set("beforeCreatedAt", String(cursor.createdAt));
      query.set("beforeMid", String(cursor.mid));
    }
    try {
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (currentGid() !== gid || version !== requestVersion) return;
      result.items.forEach(message => messages.set(message.mid, message));
      beforeCursor = result.hasMore && result.nextBeforeCreatedAt !== null
        && result.nextBeforeMid !== null
        ? {createdAt: result.nextBeforeCreatedAt, mid: result.nextBeforeMid}
        : null;
      hasMore = result.hasMore;
      renderMessages(latestPage);
      if (latestPage) {
        setFollowing(true);
        scrollToBottom(true);
        onInitialMessages(gid, result.items);
      } else {
        restoreScrollAnchor(anchor, elements.messages);
        onEarlierMessages(gid, result.items);
      }
    } catch (error) {
      console.warn("加载消息失败：", error);
    }
  }

  async function loadEarlierIfNeeded() {
    if (!currentGid() || !hasMore || loadingEarlier || refreshing) return;
    if (elements.messages.scrollTop > earlierLoadThreshold
      || elements.messages.scrollHeight <= elements.messages.clientHeight) return;
    if (!beforeCursor) return;
    loadingEarlier = true;
    try {
      await loadMessages(beforeCursor);
    } finally {
      loadingEarlier = false;
    }
  }

  async function catchUp() {
    const gid = currentGid();
    const requestVersion = version;
    const latest = [...messages.values()].reduce((left, right) =>
      compareMessages(left, right) >= 0 ? left : right);
    let cursor = {createdAt: latest.createdAt, mid: latest.mid};
    let added = false;
    while (!document.hidden && currentGid() === gid && version === requestVersion) {
      const query = new URLSearchParams({
        gid: String(gid), size: String(pageSize),
        afterCreatedAt: String(cursor.createdAt), afterMid: String(cursor.mid)
      });
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (currentGid() !== gid || version !== requestVersion) return false;
      result.items.forEach(message => messages.set(message.mid, message));
      if (result.items.length > 0) {
        added = true;
        renderMessages();
        onNewMessages(gid, result.items);
      }
      if (!result.hasMore || result.nextAfterCreatedAt === null
        || result.nextAfterMid === null) break;
      cursor = {createdAt: result.nextAfterCreatedAt, mid: result.nextAfterMid};
    }
    if (added && !followingLatest) elements.newMessages.hidden = false;
    return !document.hidden && currentGid() === gid && version === requestVersion;
  }

  async function refresh() {
    if (!currentGid() || refreshing || switchingGroup || document.hidden) return;
    refreshing = true;
    const gid = currentGid();
    const requestVersion = version;
    try {
      if (pendingCatchUp && messages.size > 0) {
        if (await catchUp()) pendingCatchUp = false;
        return;
      }
      const followedLatest = followingLatest && isNearBottom();
      const knownMids = new Set(messages.keys());
      const query = new URLSearchParams({gid: String(gid), size: String(pageSize)});
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (currentGid() !== gid || version !== requestVersion) return;
      const fresh = result.items.filter(message => !knownMids.has(message.mid));
      result.items.forEach(message => messages.set(message.mid, message));
      if (fresh.length > 0) {
        setFollowing(followedLatest);
        renderMessages();
        if (followedLatest) scrollToBottom();
        else elements.newMessages.hidden = false;
        onNewMessages(gid, fresh);
      }
    } catch (error) {
      console.warn("刷新消息失败：", error);
    } finally {
      refreshing = false;
      if (currentGid() === gid) loadEarlierIfNeeded();
    }
  }

  function open(nextGroup) {
    group = nextGroup;
    version += 1;
    switchingGroup = true;
    messages.clear();
    beforeCursor = null;
    hasMore = false;
    pendingCatchUp = false;
    elements.messages.replaceChildren();
    elements.newMessages.hidden = true;
    return loadMessages().finally(() => {
      if (currentGid() === nextGroup.gid) switchingGroup = false;
    });
  }

  function updateGroup(nextGroup) {
    if (currentGid() === nextGroup.gid) group = nextGroup;
  }

  function markAway() {
    setFollowing(false);
    pendingCatchUp = true;
  }

  function followLatest(gid) {
    if (currentGid() !== gid) return;
    setFollowing(true);
  }

  function refreshAfterSend(gid) {
    if (currentGid() === gid) return refresh();
    return Promise.resolve();
  }

  elements.messages.addEventListener("scroll", () => {
    setFollowing(isNearBottom());
    if (followingLatest) elements.newMessages.hidden = true;
    loadEarlierIfNeeded();
  });
  elements.newMessages.addEventListener("click", async () => {
    await refresh();
    setFollowing(true);
    scrollToBottom(true);
    elements.newMessages.hidden = true;
  });
  new MutationObserver(() => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      scrollToBottom();
    });
  }).observe(elements.messages, {childList: true, subtree: true});
  setFollowing(true);

  return {
    open,
    updateGroup,
    refresh,
    markAway,
    followLatest,
    refreshAfterSend,
    getCurrentGid: currentGid,
    getMessagesSnapshot: () => [...messages.values()]
  };
}
