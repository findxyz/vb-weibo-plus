// 会话消息流：当前群的消息加载、滑动窗口与滚动跟随。
// compareMessages 与滚动锚点是无状态原语，history（聊天记录）与 celebration（回归庆祝）
// 直接 import 复用，全页对「消息顺序」只有这一种定义。
import {fetchJson} from "../shared/fetch.js";

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

export function createSessions({
  elements: {messages: messagesElement, newMessages: newMessagesElement},
  messageView,
  pageSize,
  earlierLoadThreshold,
  onInitialMessages,
  onEarlierMessages,
  onNewMessages,
  onAuthExpired
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
  // 首次打开的贴底窗口期：从首屏渲染完成起，到用户主动滚动（滚轮/触摸/点按）为止。
  // 独立于 followingLatest——新消息到达会清跟随标记，但不得中断首屏图片的贴底补救。
  let initialSettling = false;

  // 滑动窗口：DOM 只保留视口附近的消息，其余区间用占位高度撑起滚动条。
  // 数据始终完整留在 messages Map 里，被回收的消息滚回视口时会重新渲染。
  // 若不限定 DOM 规模，几千条消息的大列表在插入新消息时会触发全量布局卡顿。
  const WINDOW_CHUNK = 60;
  const WINDOW_KEEP_ABOVE = 180;
  const WINDOW_KEEP_BELOW = 180;
  const WINDOW_CAP = WINDOW_KEEP_ABOVE + WINDOW_KEEP_BELOW;
  const ESTIMATED_HEIGHT = 96;
  const GAP_HEIGHT = 16;
  let orderedCache = null;
  let windowStartIdx = 0;
  let windowEndIdx = -1;
  let sliding = false;
  const heightByMid = new Map();
  const topSpacer = document.createElement("div");
  const bottomSpacer = document.createElement("div");
  topSpacer.className = "list-spacer";
  bottomSpacer.className = "list-spacer";
  topSpacer.setAttribute("aria-hidden", "true");
  bottomSpacer.setAttribute("aria-hidden", "true");

  function currentGid() {
    return group?.gid ?? null;
  }

  // 有序缓存按「连续块拼接」维护：更早分页整体旧于现有最小值，新消息整体新于最大值，
  // 拼接即可保持有序，避免每次合并都对几万条消息全量重排；边界不单调时兜底全量排序。
  function rebuildOrdered() {
    orderedCache = [...messages.values()].sort(compareMessages);
  }

  // 全量重排后旧窗口下标失效，置为无效让 resolveWindow 走兜底窗口
  function invalidateWindow() {
    windowStartIdx = 0;
    windowEndIdx = -1;
  }

  function prependOlder(items) {
    if (!items.length) return;
    items.forEach(message => messages.set(message.mid, message));
    const block = items.slice().reverse();
    if (!orderedCache?.length) {
      rebuildOrdered();
      invalidateWindow();
    } else if (compareMessages(block[block.length - 1], orderedCache[0]) < 0) {
      orderedCache = block.concat(orderedCache);
      windowStartIdx += block.length;
      windowEndIdx += block.length;
    } else {
      rebuildOrdered();
      invalidateWindow();
    }
  }

  function appendNewer(items) {
    if (!items.length) return;
    items.forEach(message => messages.set(message.mid, message));
    const block = items.slice().sort(compareMessages);
    if (!orderedCache?.length) {
      rebuildOrdered();
      invalidateWindow();
    } else if (compareMessages(orderedCache[orderedCache.length - 1], block[0]) < 0) {
      orderedCache = orderedCache.concat(block);
    } else {
      rebuildOrdered();
      invalidateWindow();
    }
  }

  function getOrdered() {
    if (!orderedCache) rebuildOrdered();
    return orderedCache;
  }

  function estimateHeight(message) {
    return (heightByMid.get(message.mid) ?? ESTIMATED_HEIGHT) + GAP_HEIGHT;
  }

  function ensureSpacers() {
    if (topSpacer.parentNode !== messagesElement) messagesElement.prepend(topSpacer);
    if (bottomSpacer.parentNode !== messagesElement) messagesElement.append(bottomSpacer);
  }

  function isSpacer(element) {
    return element === topSpacer || element === bottomSpacer;
  }

  // 把窗口边界解析为排序后的渲染区间；跟随最新时窗口贴住列表尾部
  function resolveWindow(ordered) {
    if (ordered.length <= WINDOW_CAP) {
      windowStartIdx = 0;
      windowEndIdx = ordered.length - 1;
      return [windowStartIdx, windowEndIdx];
    }
    let start;
    let end;
    if (followingLatest) {
      end = ordered.length - 1;
      start = end - WINDOW_CAP + 1;
    } else {
      start = windowStartIdx;
      end = windowEndIdx;
      if (!Number.isInteger(start) || start < 0
        || !Number.isInteger(end) || end >= ordered.length || end < start) {
        end = ordered.length - 1;
        start = end - WINDOW_CAP + 1;
      } else if (end - start + 1 > WINDOW_CAP) {
        // 超上限时从远离视口的一侧裁剪
        const excess = end - start + 1 - WINDOW_CAP;
        if (isNearBottom()) start += excess; else end -= excess;
      }
    }
    windowStartIdx = start;
    windowEndIdx = end;
    return [start, end];
  }

  function setFollowing(value) {
    followingLatest = value;
  }

  function isNearBottom() {
    return messagesElement.scrollHeight
      - messagesElement.scrollTop
      - messagesElement.clientHeight < 80;
  }

  function scrollToBottom() {
    // 未跟随时窗口可能停在更早位置，滚底前先把最新消息渲染出来
    const ordered = getOrdered();
    if (ordered.length && windowEndIdx !== ordered.length - 1) {
      windowEndIdx = ordered.length - 1;
      if (!followingLatest) windowStartIdx = Math.max(0, windowEndIdx - WINDOW_CAP + 1);
      renderMessages();
    }
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function renderMessages() {
    const ordered = getOrdered();
    if (!ordered.length) {
      invalidateWindow();
      return;
    }
    ensureSpacers();
    const [start, end] = resolveWindow(ordered);
    const renderGid = currentGid();
    const renderVersion = version;
    // 媒体加载完成把内容撑高：首屏窗口期（initialSettling）或跟随最新时重新贴底，
    // 其余时候绝不移动视口。不能靠 isNearBottom 判定——撑高发生在 load 事件之前，
    // 视口已被顶离底部；也不能只靠 followingLatest——表态行等无 load 事件的 DOM
    // 变化同样撑高，会先触发 scroll 事件把跟随标记清掉，后续媒体加载便不再贴底。
    const onMediaLoad = () => {
      if (currentGid() !== renderGid || version !== renderVersion) return;
      if (initialSettling || followingLatest) scrollToBottom();
    };
    let aboveSum = 0;
    for (let i = 0; i < start; i++) aboveSum += estimateHeight(ordered[i]);
    let belowSum = 0;
    for (let i = end + 1; i < ordered.length; i++) belowSum += estimateHeight(ordered[i]);
    const existingByMid = new Map();
    for (const element of messagesElement.children) {
      if (isSpacer(element)) continue;
      if (element.dataset.mid) existingByMid.set(Number(element.dataset.mid), element);
    }
    const desiredMids = new Set();
    for (let i = start; i <= end; i++) desiredMids.add(ordered[i].mid);
    for (const [mid, element] of existingByMid) {
      if (!desiredMids.has(mid)) element.remove();
    }
    let previous = topSpacer;
    for (let i = start; i <= end; i++) {
      const message = ordered[i];
      let element = existingByMid.get(message.mid);
      if (!element) element = messageView.messageElement(message, null, onMediaLoad, renderGid);
      if (element !== previous.nextElementSibling) previous.after(element);
      previous = element;
    }
    if (bottomSpacer !== previous.nextElementSibling) previous.after(bottomSpacer);
    for (const element of messagesElement.children) {
      if (isSpacer(element) || !element.dataset.mid) continue;
      heightByMid.set(Number(element.dataset.mid), element.offsetHeight);
    }
    topSpacer.style.height = `${aboveSum}px`;
    bottomSpacer.style.height = `${belowSum}px`;
  }

  // 实时表态结果统一由会话应用：只有当前群的结果生效；空列表会清掉旧表态，
  // 未渲染消息只写缓存，重新进窗口时按缓存展示。
  function applyAttitudes(gid, result) {
    if (currentGid() !== gid) return;
    // 先一次遍历收集已渲染元素，避免按 mid 逐个 querySelector
    const renderedByMid = new Map();
    for (const element of messagesElement.children) {
      if (isSpacer(element) || !element.dataset.mid) continue;
      renderedByMid.set(Number(element.dataset.mid), element);
    }
    for (const [mid, attitudes] of Object.entries(result)) {
      const message = messages.get(Number(mid));
      if (!message) continue;
      message.attitudes = Array.isArray(attitudes) ? attitudes : [];
      const element = renderedByMid.get(Number(mid));
      if (element) {
        messageView.updateAttitudes(element, message);
        heightByMid.set(Number(mid), element.offsetHeight);
      }
    }
    // 表态行插入同样撑高消息且无 load 事件，与媒体加载同一贴底口径
    if (initialSettling || followingLatest) scrollToBottom();
  }

  // 当前窗口实际渲染的消息对象，供按需拉取表态等场景使用
  function getRenderedMessages() {
    const rendered = [];
    for (const element of messagesElement.children) {
      if (isSpacer(element) || !element.dataset.mid) continue;
      const message = messages.get(Number(element.dataset.mid));
      if (message) rendered.push(message);
    }
    return rendered;
  }

  async function loadMessages(cursor = null) {
    const latestPage = cursor === null;
    const anchor = latestPage ? null : captureScrollAnchor(messagesElement);
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
      if (latestPage) appendNewer(result.items); else prependOlder(result.items);
      beforeCursor = result.hasMore && result.nextBeforeCreatedAt !== null
        && result.nextBeforeMid !== null
        ? {createdAt: result.nextBeforeCreatedAt, mid: result.nextBeforeMid}
        : null;
      hasMore = result.hasMore;
      if (!latestPage && result.items.length) {
        // 新拉到的更早消息直接进入窗口顶部，保持向上翻历史时新内容可见
        windowStartIdx = 0;
      }
      renderMessages();
      if (latestPage) {
        setFollowing(true);
        initialSettling = true;
        scrollToBottom();
        onInitialMessages(gid, result.items);
      } else {
        restoreScrollAnchor(anchor, messagesElement);
        onEarlierMessages(gid, result.items);
      }
    } catch (error) {
      if (error.status === 401) onAuthExpired();
      else console.warn("加载消息失败：", error);
    }
  }

  async function loadEarlierIfNeeded() {
    if (!currentGid() || !hasMore || loadingEarlier || refreshing) return;
    if (messagesElement.scrollTop > earlierLoadThreshold
      || messagesElement.scrollHeight <= messagesElement.clientHeight) return;
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
      if (result.items.length > 0) {
        appendNewer(result.items);
        added = true;
        renderMessages();
        onNewMessages(gid, result.items);
      }
      if (!result.hasMore || result.nextAfterCreatedAt === null
        || result.nextAfterMid === null) break;
      cursor = {createdAt: result.nextAfterCreatedAt, mid: result.nextAfterMid};
    }
    if (added) newMessagesElement.hidden = false;
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
      const knownMids = new Set(messages.keys());
      const query = new URLSearchParams({gid: String(gid), size: String(pageSize)});
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (currentGid() !== gid || version !== requestVersion) return;
      const fresh = result.items.filter(message => !knownMids.has(message.mid));
      if (fresh.length > 0) {
        appendNewer(fresh);
        // 除首次打开群聊外永不自动贴底：新消息保持视口原位置，弹提示由用户点击跳转。
        // 视口已落后于最新消息，跟随标记一并清除，避免后续媒体加载把视口拽下去。
        renderMessages();
        setFollowing(false);
        newMessagesElement.hidden = false;
        onNewMessages(gid, fresh);
      }
    } catch (error) {
      if (error.status === 401) onAuthExpired();
      else console.warn("刷新消息失败：", error);
    } finally {
      refreshing = false;
      if (currentGid() === gid) void loadEarlierIfNeeded();
    }
  }

  // 视口上方还压着多少条已渲染消息（跳过占位）
  function countRenderedAbove(containerTop) {
    let count = 0;
    let element = topSpacer.nextElementSibling;
    while (element && element !== bottomSpacer) {
      if (element.getBoundingClientRect().bottom > containerTop) break;
      count += 1;
      element = element.nextElementSibling;
    }
    return count;
  }

  // 视口下方还压着多少条已渲染消息（跳过占位）
  function countRenderedBelow(viewportBottom) {
    let count = 0;
    let element = bottomSpacer.previousElementSibling;
    while (element && element !== topSpacer) {
      if (element.getBoundingClientRect().top < viewportBottom) break;
      count += 1;
      element = element.previousElementSibling;
    }
    return count;
  }

  function sumEstimated(list) {
    let sum = 0;
    for (const message of list) sum += estimateHeight(message);
    return sum;
  }

  function sumMeasured(list) {
    let sum = 0;
    for (const message of list) {
      sum += (heightByMid.get(message.mid) ?? ESTIMATED_HEIGHT) + GAP_HEIGHT;
    }
    return sum;
  }

  // 缓冲区消耗过半时向该方向物化一批，并从另一端回收一批，保持 DOM 规模有界。
  // 物化内容落在视口上方（或视口已进入底部占位区）时，按「实测 - 估算」差值补偿
  // scrollTop，估算误差只影响滚动条长度，不影响视口稳定。
  function slideWindow() {
    if (sliding || windowEndIdx < 0 || switchingGroup || document.hidden || !currentGid()) return;
    const ordered = getOrdered();
    if (ordered.length <= WINDOW_CAP) return;
    const container = messagesElement;
    const rect = container.getBoundingClientRect();
    // 跳滚完全越过当前窗口时，直接定位占位区内的目标消息，避免逐批渲染沿途内容。
    const aboveWindow = topSpacer.nextElementSibling.getBoundingClientRect().top >= rect.bottom;
    const belowWindow = bottomSpacer.previousElementSibling.getBoundingClientRect().bottom <= rect.top;
    if (aboveWindow || belowWindow) {
      if (followingLatest) {
        scrollToBottom();
        return;
      }
      sliding = true;
      try {
        let target = aboveWindow ? 0 : windowEndIdx + 1;
        let targetTop = aboveWindow
          ? topSpacer.getBoundingClientRect().top + GAP_HEIGHT
          : bottomSpacer.getBoundingClientRect().top;
        while (target < ordered.length - 1 && targetTop + estimateHeight(ordered[target]) <= rect.top) {
          targetTop += estimateHeight(ordered[target]);
          target += 1;
        }
        windowStartIdx = Math.max(0, Math.min(target - WINDOW_KEEP_ABOVE, ordered.length - WINDOW_CAP));
        windowEndIdx = windowStartIdx + WINDOW_CAP - 1;
        renderMessages();
        const anchor = container.querySelector(`[data-mid="${ordered[target].mid}"]`);
        container.scrollTop += anchor.getBoundingClientRect().top - targetTop;
      } finally {
        sliding = false;
      }
      return;
    }
    const aboveRendered = countRenderedAbove(rect.top);
    if (aboveRendered < WINDOW_KEEP_ABOVE / 2 && windowStartIdx > 0) {
      sliding = true;
      try {
        const oldStart = windowStartIdx;
        const newStart = Math.max(0, oldStart - WINDOW_CHUNK);
        const materialized = ordered.slice(newStart, oldStart);
        const estimated = sumEstimated(materialized);
        const scrollTopBefore = container.scrollTop;
        windowStartIdx = newStart;
        if (windowEndIdx - windowStartIdx + 1 > WINDOW_CAP) {
          windowEndIdx = windowStartIdx + WINDOW_CAP - 1;
        }
        renderMessages();
        container.scrollTop = scrollTopBefore + (sumMeasured(materialized) - estimated);
      } finally {
        sliding = false;
      }
      return;
    }
    const belowRendered = countRenderedBelow(rect.bottom);
    if (belowRendered < WINDOW_KEEP_BELOW / 2 && windowEndIdx < ordered.length - 1) {
      sliding = true;
      try {
        const oldEnd = windowEndIdx;
        const newEnd = Math.min(ordered.length - 1, oldEnd + WINDOW_CHUNK);
        const materialized = ordered.slice(oldEnd + 1, newEnd + 1);
        const estimated = sumEstimated(materialized);
        const insideSpacer = bottomSpacer.getBoundingClientRect().top < rect.bottom;
        const scrollTopBefore = container.scrollTop;
        windowEndIdx = newEnd;
        if (windowEndIdx - windowStartIdx + 1 > WINDOW_CAP) {
          windowStartIdx = windowEndIdx - WINDOW_CAP + 1;
        }
        renderMessages();
        if (insideSpacer) {
          container.scrollTop = scrollTopBefore + (sumMeasured(materialized) - estimated);
        }
      } finally {
        sliding = false;
      }
    }
  }

  function open(nextGroup) {
    group = nextGroup;
    version += 1;
    switchingGroup = true;
    messages.clear();
    heightByMid.clear();
    orderedCache = null;
    invalidateWindow();
    beforeCursor = null;
    hasMore = false;
    pendingCatchUp = false;
    messagesElement.replaceChildren();
    newMessagesElement.hidden = true;
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

  // 滚动合帧：一帧内密集的 scroll 事件只做一次跟随判定、窗口滑动与更早消息加载，
  // 消除滚动路径上逐帧多次的同步布局测量。首个事件保持同步处理（与逐事件处理
  // 时序一致），同帧内后续事件合并为帧末的一次收尾。
  let trailingFrame = 0;
  let trailingPending = false;
  function handleScroll() {
    // 离开期间锚点恢复等程序性滚动会触发 scroll 事件，不得借此恢复跟随
    setFollowing(!document.hidden && isNearBottom());
    if (followingLatest) newMessagesElement.hidden = true;
    slideWindow();
    void loadEarlierIfNeeded();
  }
  messagesElement.addEventListener("scroll", () => {
    if (trailingFrame) {
      trailingPending = true;
      return;
    }
    handleScroll();
    trailingFrame = requestAnimationFrame(() => {
      trailingFrame = 0;
      if (trailingPending) {
        trailingPending = false;
        handleScroll();
      }
    });
  });
  // 首屏贴底窗口期只被用户主动滚动终结；程序性贴底不触发这些事件
  for (const eventName of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    messagesElement.addEventListener(eventName, () => {
      initialSettling = false;
    }, {passive: true});
  }
  newMessagesElement.addEventListener("click", async () => {
    await refresh();
    setFollowing(true);
    scrollToBottom();
    newMessagesElement.hidden = true;
  });
  setFollowing(true);

  return {
    open,
    updateGroup,
    refresh,
    markAway,
    followLatest,
    refreshAfterSend,
    applyAttitudes,
    getRenderedMessages,
    getMessagesSnapshot: () => [...messages.values()]
  };
}
