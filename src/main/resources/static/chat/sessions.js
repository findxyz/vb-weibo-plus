// 会话消息流：当前群的消息加载、滑动窗口与滚动跟随。
// compareMessages 与滚动锚点是无状态原语，history（聊天记录）与 celebration（回归庆祝）
// 直接 import 复用，全页对「消息顺序」只有这一种定义。
import {fetchJson} from "../shared/fetch.js";
import {STORAGE_KEYS} from "../shared/storage-keys.js";

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

export function fetchMessagePage(gid, size, cursor, direction) {
  const query = new URLSearchParams({gid: String(gid), size: String(size)});
  if (cursor) {
    query.set(`${direction}CreatedAt`, String(cursor.createdAt));
    query.set(`${direction}Mid`, String(cursor.mid));
  }
  return fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
}

// 从一页结果提取下一页游标；hasMore 为假或游标字段缺失时返回 null，
// 调用方据此停止翻页，不必各自拼字段名。
export function nextCursor(result, direction) {
  if (!result.hasMore) return null;
  const createdAt = direction === "before" ? result.nextBeforeCreatedAt : result.nextAfterCreatedAt;
  const mid = direction === "before" ? result.nextBeforeMid : result.nextAfterMid;
  return createdAt != null && mid != null ? {createdAt, mid} : null;
}

export function createSessions({
  elements: {messages: messagesElement, newMessages: newMessagesElement, scrollBottom: scrollBottomElement},
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
  let pendingCatchUp = false;
  let refreshing = false;
  let switchingGroup = false;
  let loadingEarlier = false;
  // 收尾：一次性落底或阅读位恢复动作之后，已渲染的图片与表态行会陆续撑高内容，
  // 撑高就按动作目标补偿视口（落底补回底部，恢复把锚点按回记录偏移），保证动作
  // 承诺的位置是真的。用户主动输入或离开页面即停止，此后任何代码路径都不再移动
  // 视口；新消息永远只弹提示，不参与收尾。
  let settle = null;

  // 滑动窗口：DOM 只保留视口附近的消息，其余区间用占位高度撑起滚动条。
  // 数据始终完整留在 messages Map 里，被回收的消息滚回视口时会重新渲染。
  // 若不限定 DOM 规模，几千条消息的大列表在插入新消息时会触发全量布局卡顿。
  const WINDOW_CHUNK = 60;
  const WINDOW_KEEP_ABOVE = 180;
  const WINDOW_KEEP_BELOW = 180;
  const WINDOW_CAP = WINDOW_KEEP_ABOVE + WINDOW_KEEP_BELOW;
  const ESTIMATED_HEIGHT = 96;
  const GAP_HEIGHT = 16;
  // 数据侧上限：DOM 有滑动窗口控制，messages Map 仍只增不减，长会话会撑内存。
  // 超限裁掉最旧一批；更早区间已被丢弃，向上翻页不再可能，直接关掉 beforeCursor。
  // history 弹窗走独立接口，不受影响。
  const MAX_MESSAGES = 20000;
  const TRIM_TO = 18000;
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
    // 新消息一到就结束落底收尾，旧媒体随后加载也不能借旧动作跳到新底部。
    if (settle?.kind === "bottom") settle = null;
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
    trimOverflow();
  }

  // 裁剪只发生在新消息追加后（只有尾部增长会把总量顶过上限）：
  // 删最旧一批并同步收缩有序缓存、高度缓存与窗口下标
  function trimOverflow() {
    if (messages.size <= MAX_MESSAGES) return;
    const drop = messages.size - TRIM_TO;
    for (let i = 0; i < drop; i++) {
      messages.delete(orderedCache[i].mid);
      heightByMid.delete(orderedCache[i].mid);
    }
    orderedCache = orderedCache.slice(drop);
    windowStartIdx = Math.max(0, windowStartIdx - drop);
    windowEndIdx = Math.max(-1, windowEndIdx - drop);
    if (windowEndIdx < 0) invalidateWindow();
    beforeCursor = null;
    hasMore = false;
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

  // 把窗口边界解析为排序后的渲染区间；新消息不移动窗口，由窗口滑动与跳底按需物化
  function resolveWindow(ordered) {
    if (ordered.length <= WINDOW_CAP) {
      windowStartIdx = 0;
      windowEndIdx = ordered.length - 1;
      return [windowStartIdx, windowEndIdx];
    }
    let start = windowStartIdx;
    let end = windowEndIdx;
    if (!Number.isInteger(start) || start < 0
      || !Number.isInteger(end) || end >= ordered.length || end < start) {
      end = ordered.length - 1;
      start = end - WINDOW_CAP + 1;
    } else if (end - start + 1 > WINDOW_CAP) {
      // 超上限时从远离视口的一侧裁剪
      const excess = end - start + 1 - WINDOW_CAP;
      if (isNearBottom()) start += excess; else end -= excess;
    }
    windowStartIdx = start;
    windowEndIdx = end;
    return [start, end];
  }

  function isNearBottom() {
    return messagesElement.scrollHeight
      - messagesElement.scrollTop
      - messagesElement.clientHeight < 80;
  }

  function scrollToBottom() {
    // 窗口可能停在更早位置，滚底前先把最新消息渲染出来
    const ordered = getOrdered();
    if (ordered.length && windowEndIdx !== ordered.length - 1) {
      windowEndIdx = ordered.length - 1;
      windowStartIdx = Math.max(0, windowEndIdx - WINDOW_CAP + 1);
      renderMessages();
    }
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  // 一次性落底动作的统一入口：落底并进入收尾
  function holdBottom() {
    settle = {kind: "bottom", boundary: messages.size ? lastMessage() : null};
    scrollToBottom();
  }

  // 恢复阅读位：以锚点消息为参照物化窗口，再按记录偏移精确落位。
  // 落位按渲染后的实测位置计算，估算误差不影响锚点回到记录偏移。
  function placeAnchor(mid, offset) {
    const ordered = getOrdered();
    const anchorIdx = ordered.findIndex(message => message.mid === mid);
    if (anchorIdx < 0) return;
    windowStartIdx = Math.max(0, Math.min(anchorIdx - WINDOW_KEEP_ABOVE, ordered.length - WINDOW_CAP));
    windowEndIdx = Math.min(ordered.length - 1, windowStartIdx + WINDOW_CAP - 1);
    renderMessages();
    const anchorElement = messagesElement.querySelector(`[data-mid="${mid}"]`);
    if (!anchorElement) return;
    messagesElement.scrollTop += anchorElement.getBoundingClientRect().top
      - messagesElement.getBoundingClientRect().top - offset;
  }

  function holdAnchor(record) {
    settle = {kind: "anchor", mid: record.mid, offset: record.offset, boundary: lastMessage()};
    placeAnchor(record.mid, record.offset);
  }

  // 收尾补偿：媒体加载或表态行撑高内容时，把视口按回本次动作的目标位置。
  // 只补救动作发生时已存在的消息；之后到达的新消息不参与收尾，永远只弹提示
  function settleGrowth(message) {
    if (!settle?.boundary || compareMessages(message, settle.boundary) > 0) return;
    if (settle.kind === "bottom") scrollToBottom();
    else placeAnchor(settle.mid, settle.offset);
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
      if (!element) element = messageView.messageElement(message, null, () => {
        // 收尾期间图片加载撑高内容，撑高就按动作目标补偿视口；不能靠 isNearBottom
        // 判定——撑高发生在 load 事件之前，视口已被顶离底部
        if (currentGid() !== renderGid || version !== renderVersion) return;
        settleGrowth(message);
      }, renderGid);
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
    // 表态行插入撑高已渲染消息且无 load 事件，与媒体加载同一收尾口径；
    // 多条同时撑高时取最旧一条判定，一次补偿即覆盖
    let oldestGrowth = null;
    for (const [mid, attitudes] of Object.entries(result)) {
      const message = messages.get(Number(mid));
      if (!message) continue;
      message.attitudes = Array.isArray(attitudes) ? attitudes : [];
      const element = renderedByMid.get(Number(mid));
      if (element) {
        messageView.updateAttitudes(element, message);
        heightByMid.set(Number(mid), element.offsetHeight);
        if (!oldestGrowth || compareMessages(message, oldestGrowth) < 0) oldestGrowth = message;
      }
    }
    if (oldestGrowth) settleGrowth(oldestGrowth);
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

  async function loadMessages(cursor = null, restoreSavedPosition = false) {
    const latestPage = cursor === null;
    const anchor = latestPage ? null : captureScrollAnchor(messagesElement);
    const gid = currentGid();
    const requestVersion = version;
    try {
      const result = await fetchMessagePage(gid, pageSize, cursor, "before");
      if (currentGid() !== gid || version !== requestVersion) return;
      if (latestPage) appendNewer(result.items); else prependOlder(result.items);
      beforeCursor = nextCursor(result, "before");
      hasMore = result.hasMore;
      if (!latestPage && result.items.length) {
        // 新拉到的更早消息直接进入窗口顶部，保持向上翻历史时新内容可见
        windowStartIdx = 0;
      }
      renderMessages();
      if (latestPage) {
        if (restoreSavedPosition) await restoreReadingPosition(gid);
        else holdBottom();
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
      const result = await fetchMessagePage(gid, pageSize, cursor, "after");
      if (currentGid() !== gid || version !== requestVersion) return false;
      if (result.items.length > 0) {
        appendNewer(result.items);
        added = true;
        renderMessages();
        onNewMessages(gid, result.items);
      }
      const next = nextCursor(result, "after");
      if (!next) break;
      cursor = next;
    }
    if (added) newMessagesElement.hidden = false;
    return !document.hidden && currentGid() === gid && version === requestVersion;
  }

  // 返回是否成功：供轮询退避判定，早退守卫不算失败
  async function refresh() {
    if (!currentGid() || refreshing || switchingGroup || document.hidden) return true;
    refreshing = true;
    const gid = currentGid();
    const requestVersion = version;
    try {
      if (pendingCatchUp && messages.size > 0) {
        if (await catchUp()) pendingCatchUp = false;
        return true;
      }
      const knownMids = new Set(messages.keys());
      const result = await fetchMessagePage(gid, pageSize);
      if (currentGid() !== gid || version !== requestVersion) return true;
      const fresh = result.items.filter(message => !knownMids.has(message.mid));
      if (fresh.length > 0) {
        // 新消息永不移动视口：保持原位置，弹提示由用户点击跳转。
        appendNewer(fresh);
        renderMessages();
        newMessagesElement.hidden = false;
        onNewMessages(gid, fresh);
      }
      return true;
    } catch (error) {
      if (error.status === 401) onAuthExpired();
      else console.warn("刷新消息失败：", error);
      return false;
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

  const READING_POSITION_PREFIX = STORAGE_KEYS.CHAT_READING_POSITION_PREFIX;

  function lastMessage() {
    return [...messages.values()].reduce((left, right) =>
      compareMessages(left, right) >= 0 ? left : right);
  }

  // 阅读位离开页面时保存。真正落在底部只记
  // atBottom（恢复时等同首开落底），否则记锚点消息与容器内偏移，供再进同群恢复。
  function saveReadingPosition() {
    const gid = currentGid();
    if (!gid || !messages.size) return;
    let record;
    if (messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 1) {
      record = {atBottom: true};
    } else {
      const anchor = captureScrollAnchor(messagesElement);
      const latest = lastMessage();
      if (!anchor || !latest) return;
      record = {
        mid: Number(anchor.mid),
        offset: anchor.top - messagesElement.getBoundingClientRect().top,
        lastSeen: {createdAt: latest.createdAt, mid: latest.mid},
        hadNewMessages: !newMessagesElement.hidden
      };
    }
    try {
      sessionStorage.setItem(READING_POSITION_PREFIX + gid, JSON.stringify(record));
    } catch {
      // 存不进去就当没有阅读位，下次进群按首开处理
    }
  }

  function readReadingPosition(gid) {
    try {
      const record = JSON.parse(sessionStorage.getItem(READING_POSITION_PREFIX + gid));
      if (!record) return null;
      if (record.atBottom === true) return record;
      if (Number.isInteger(record.mid) && Number.isFinite(record.offset) && record.lastSeen
        && Number.isFinite(record.lastSeen.createdAt) && Number.isInteger(record.lastSeen.mid)) {
        return record;
      }
    } catch {
      // 记录损坏或存储不可用视为不存在
    }
    return null;
  }

  // 进群落位：有可恢复的阅读位就恢复原位置，否则按首开落底。锚点不在最新页时
  // 逐页向前补齐到锚点所在页，补齐失败（锚点已拉不到）落底部兜底。
  async function restoreReadingPosition(gid) {
    const record = readReadingPosition(gid);
    if (!record || record.atBottom) {
      holdBottom();
      return;
    }
    while (!messages.has(record.mid) && beforeCursor && hasMore) {
      const knownCount = messages.size;
      await loadMessages(beforeCursor);
      if (currentGid() !== gid) return;
      // 加载失败或空页不再推进：停止补页，交给下方落底兜底，避免同游标死循环
      if (messages.size === knownCount) break;
    }
    if (!messages.has(record.mid)) {
      holdBottom();
      return;
    }
    holdAnchor(record);
    // 离开期间到达的消息只弹提示：恢复的视口归用户，跳不跳由用户决定；
    // 恢复后本就落在底部附近时不弹，与滚动判定的收起口径一致
    if (!isNearBottom() && (record.hadNewMessages || compareMessages(lastMessage(), record.lastSeen) > 0)) {
      newMessagesElement.hidden = false;
    }
  }

  function open(nextGroup) {
    // 只有页面首次初始化才恢复跨页面阅读位，列表里每次选群都落底。
    const restoreSavedPosition = !group;
    settle = null;
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
    return loadMessages(null, restoreSavedPosition).finally(() => {
      if (currentGid() === nextGroup.gid) switchingGroup = false;
    });
  }

  function updateGroup(nextGroup) {
    if (currentGid() === nextGroup.gid) group = nextGroup;
  }

  function markAway() {
    // 离开即记下阅读位并结束收尾：回来补拉的内容不再参与补救
    saveReadingPosition();
    settle = null;
    pendingCatchUp = true;
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
    // 离开期间锚点恢复等程序性滚动会触发 scroll 事件，不得借此隐藏提示
    if (!document.hidden && isNearBottom()) newMessagesElement.hidden = true;
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
  // 用户主动输入也会终结收尾；程序性落位不触发这些事件
  for (const eventName of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    messagesElement.addEventListener(eventName, () => {
      settle = null;
    }, {passive: true});
  }
  // 新消息提示与常驻滚底按钮同一动作：补一次刷新后一次性落底，并收起提示
  const jumpToLatest = async () => {
    const gid = currentGid();
    const requestVersion = version;
    await refresh();
    if (currentGid() !== gid || version !== requestVersion) return;
    holdBottom();
    newMessagesElement.hidden = true;
  };
  newMessagesElement.addEventListener("click", jumpToLatest);
  scrollBottomElement.addEventListener("click", jumpToLatest);

  return {
    open,
    updateGroup,
    refresh,
    markAway,
    refreshAfterSend,
    applyAttitudes,
    getRenderedMessages,
    getMessagesSnapshot: () => [...messages.values()]
  };
}
