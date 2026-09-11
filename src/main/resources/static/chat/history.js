import {appendHighlightedText} from "../shared/highlight.js";

export function createHistory({elements, fetchJson, localDateValue, calendarMonthsAgo,
  pageSize, searchPageSize, earlierLoadThreshold, compareMessages, captureScrollAnchor,
  restoreScrollAnchor, messageView, formatDateTime, mediaTypes, redPacketText, group = {}}) {
  const state = {
    gid: group.gid || null, page: 1, total: 0, query: null, targetMid: null,
    beforeCursor: null, afterCursor: null, loadingMore: false, requestVersion: 0,
    group
  };

  function historySummary(message) {
    if (message.videoUrl || message.mediaType === mediaTypes.VIDEO
      || (message.mediaType === mediaTypes.VIDEO_OR_REDPACKET
        && !(message.text || "").includes(redPacketText))) return "[视频]";
    if (message.mediaType === mediaTypes.WEIBO_CARD) return "[微博]";
    if (message.mediaType === mediaTypes.IMAGE || message.previewUrl) return "[图片]";
    return message.text?.trim() || `[${message.msgTypeName || "消息"}]`;
  }

  function reset() {
    const start = calendarMonthsAgo(new Date(), 3);
    state.requestVersion += 1;
    state.page = 1; state.total = 0; state.query = null; state.targetMid = null;
    state.beforeCursor = null; state.afterCursor = null; state.loadingMore = false;
    elements.historyStart.value = localDateValue(start);
    elements.historyEnd.value = localDateValue(new Date());
    const syncDate = new Date(); syncDate.setFullYear(syncDate.getFullYear() - 2);
    elements.historySyncTime.value = localDateValue(syncDate);
    elements.historySender.value = ""; elements.historyKeyword.value = "";
    elements.historyResultsList.replaceChildren(); elements.historyMessages.replaceChildren();
    elements.historyEarlierState.textContent = ""; elements.historyNewerState.textContent = "";
    elements.historyPageState.textContent = ""; elements.historyResults.hidden = true;
    elements.historyContext.hidden = true; elements.historyEmpty.hidden = false;
    elements.historyEmpty.textContent = "设置筛选条件后点击查询";
    elements.historyFeedback.textContent = "";
  }

  function renderResults(items) {
    elements.historyResultsList.replaceChildren(...items.map(message => {
      const button = document.createElement("button");
      button.className = "history-result";
      button.type = "button"; button.dataset.mid = String(message.mid);
      const time = document.createElement("span"); time.className = "history-result-time";
      time.textContent = formatDateTime(message.createdAt);
      const sender = document.createElement("span"); sender.className = "history-result-sender";
      sender.textContent = message.senderName || "未知成员";
      const summary = document.createElement("span"); summary.className = "history-result-summary";
      appendHighlightedText(summary, historySummary(message), state.query?.keyword);
      button.append(time, sender, summary);
      button.addEventListener("click", () => openContext(message));
      return button;
    }));
    const pageCount = Math.max(1, Math.ceil(state.total / searchPageSize));
    elements.historyPageState.textContent = `第 ${state.page} / ${pageCount} 页，共 ${state.total} 条`;
    elements.historyPrevious.disabled = state.page <= 1;
    elements.historyNext.disabled = state.page >= pageCount;
    elements.historyEmpty.hidden = true; elements.historyContext.hidden = true; elements.historyResults.hidden = false;
    elements.historyResultsList.scrollTop = 0;
  }

  function messageElements(messages) {
    return [...messages].sort(compareMessages).map(message => messageView.messageElement(message, state.targetMid));
  }

  function updateEdges() {
    elements.historyEarlierState.textContent = state.beforeCursor ? "向上滚动加载更早消息" : "没有更早消息";
    elements.historyNewerState.textContent = state.afterCursor ? "向下滚动加载更新消息" : "没有更新消息";
  }

  function scrollMessageToStart(message) {
    const containerTop = elements.historyMessages.getBoundingClientRect().top;
    const paddingTop = Number.parseFloat(getComputedStyle(elements.historyMessages).paddingTop) || 0;
    elements.historyMessages.scrollTop += message.getBoundingClientRect().top
      - containerTop - paddingTop;
  }

  function cursorRequest(direction, message) {
    const query = new URLSearchParams({gid: String(state.gid), size: String(pageSize)});
    query.set(`${direction}CreatedAt`, String(message.createdAt));
    query.set(`${direction}Mid`, String(message.mid));
    return fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
  }

  async function openContext(target) {
    const version = ++state.requestVersion;
    state.loadingMore = false; state.targetMid = target.mid;
    state.beforeCursor = null; state.afterCursor = null; elements.historyResults.hidden = true;
    elements.historyContext.hidden = false; elements.historyEarlierState.textContent = "";
    elements.historyNewerState.textContent = ""; elements.historyFeedback.textContent = "";
    elements.historyMessages.replaceChildren(...messageElements([target]));
    try {
      const [before, after] = await Promise.all([cursorRequest("before", target), cursorRequest("after", target)]);
      if (version !== state.requestVersion) return;
      state.beforeCursor = before.hasMore ? {createdAt: before.nextBeforeCreatedAt, mid: before.nextBeforeMid} : null;
      state.afterCursor = after.hasMore ? {createdAt: after.nextAfterCreatedAt, mid: after.nextAfterMid} : null;
      elements.historyMessages.replaceChildren(...messageElements([...before.items, target, ...after.items]));
      updateEdges();
      elements.historyMessages.querySelector(`[data-mid="${target.mid}"]`)?.scrollIntoView({block: "center"});
    } catch {
      if (version === state.requestVersion) elements.historyFeedback.textContent = "消息上下文加载失败，请返回后重试。";
    }
  }

  async function loadMore(direction) {
    const earlier = direction === "before";
    const cursor = earlier ? state.beforeCursor : state.afterCursor;
    if (!cursor || state.loadingMore) return;
    state.loadingMore = true;
    const version = state.requestVersion;
    const anchor = earlier ? captureScrollAnchor(elements.historyMessages) : null;
    try {
      const result = await cursorRequest(direction, cursor);
      if (version !== state.requestVersion) return;
      const loaded = messageElements(result.items);
      const next = result.hasMore ? {
        createdAt: earlier ? result.nextBeforeCreatedAt : result.nextAfterCreatedAt,
        mid: earlier ? result.nextBeforeMid : result.nextAfterMid
      } : null;
      if (earlier) {
        state.beforeCursor = next;
        elements.historyMessages.prepend(...loaded);
        restoreScrollAnchor(anchor, elements.historyMessages);
      } else {
        state.afterCursor = next;
        elements.historyMessages.append(...loaded);
        if (loaded[0]) scrollMessageToStart(loaded[0]);
      }
      updateEdges();
    } catch {
      if (version === state.requestVersion) {
        (earlier ? elements.historyEarlierState : elements.historyNewerState).textContent
          = earlier ? "更早消息加载失败" : "更新消息加载失败";
      }
    } finally {
      if (version === state.requestVersion) state.loadingMore = false;
    }
  }

  async function query(page) {
    const version = ++state.requestVersion;
    const query = new URLSearchParams({gid: String(state.gid), page: String(page), size: String(searchPageSize)});
    const filters = state.query;
    if (filters.start) query.set("start", `${filters.start} 00:00:00`);
    if (filters.end) query.set("end", `${filters.end} 23:59:59`);
    if (filters.sender) query.set("senderName", filters.sender);
    if (filters.keyword) query.set("keyword", filters.keyword);
    elements.historyEmpty.hidden = true; elements.historyContext.hidden = true;
    try {
      const result = await fetchJson(`/chat/messages?${query}`, {cache: "no-store"});
      if (version !== state.requestVersion) return;
      state.page = result.page; state.total = result.total;
      renderResults(result.items);
      elements.historyFeedback.textContent = result.items.length ? "" : "没有符合条件的聊天记录";
    } catch {
      if (version === state.requestVersion) {
        elements.historyResults.hidden = true;
        elements.historyFeedback.textContent = "聊天记录查询失败，请稍后重试。";
      }
    }
  }

  async function capture() {
    if (!state.gid) return;
    elements.historyEmpty.hidden = true; elements.historyResults.hidden = true; elements.historyContext.hidden = true;
    const raw = elements.historySyncTime.value;
    if (!raw) { elements.historyFeedback.textContent = "请先选择要同步到的历史日期。"; return; }
    const version = ++state.requestVersion;
    try {
      const query = new URLSearchParams({gid: String(state.gid), sinceTime: `${raw} 00:00:00`});
      const response = await fetch(`/chat/since?${query}`, {method: "POST"});
      if (!response.ok) throw new Error();
      if (version === state.requestVersion) elements.historyFeedback.textContent = "已开始同步更早的历史消息，稍后请手动刷新查看。";
    } catch {
      if (version === state.requestVersion) elements.historyFeedback.textContent = "同步历史请求失败，请稍后重试。";
    }
  }

  function close() {
    state.requestVersion += 1;
    if (elements.historyDialog.open) elements.historyDialog.close();
  }

  function open() {
    reset();
    elements.historyDialog.showModal();
  }

  function setGroup(nextGroup) {
    state.gid = nextGroup.gid; state.group = nextGroup;
    elements.historyOpen.disabled = false;
    elements.historyTitle.textContent = `聊天记录 - ${nextGroup.name || `群聊 ${nextGroup.gid}`}`;
  }

  elements.historyOpen.addEventListener("click", open);
  elements.historyClose.addEventListener("click", close);
  elements.historyForm.addEventListener("submit", event => {
    event.preventDefault();
    state.query = {
      start: elements.historyStart.value, end: elements.historyEnd.value,
      sender: elements.historySender.value.trim(), keyword: elements.historyKeyword.value.trim()
    };
    query(1);
  });
  elements.historyPrevious.addEventListener("click", () => query(state.page - 1));
  elements.historyNext.addEventListener("click", () => query(state.page + 1));
  elements.historySync.addEventListener("click", capture);
  elements.historyBack.addEventListener("click", () => {
    state.requestVersion += 1;
    elements.historyContext.hidden = true;
    elements.historyFeedback.textContent = "";
    elements.historyResults.hidden = false;
  });
  elements.historyMessages.addEventListener("scroll", () => {
    if (elements.historyMessages.scrollHeight <= elements.historyMessages.clientHeight) return;
    if (elements.historyMessages.scrollTop <= earlierLoadThreshold) return loadMore("before");
    const distance = elements.historyMessages.scrollHeight
      - elements.historyMessages.scrollTop - elements.historyMessages.clientHeight;
    if (distance <= earlierLoadThreshold) loadMore("after");
  });

  return {open, close, setGroup};
}
