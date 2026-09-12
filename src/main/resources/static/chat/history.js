import {appendHighlightedText} from "../shared/highlight.js";
import {calendarMonthsAgo, localDateValue} from "../shared/date.js";
import {fetchJson} from "../shared/fetch.js";
import {MEDIA_TYPE} from "./message-view.js";
import {captureScrollAnchor, compareMessages, restoreScrollAnchor} from "./sessions.js";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
function formatDateTime(timestamp) { return dateTimeFormatter.format(new Date(timestamp)); }

// 红包消息的文本里带这句话，用于把 mediaType=13 从「视频」里区分出来
const RED_PACKET_TEXT = "收到红包消息";

export function createHistory({
  elements: {
    historyDialog, historyOpen, historyClose, historyBack, historyForm, historyKeyword,
    historySender, historyStart, historyEnd, historySync, historySyncTime, historyTitle,
    historyMessages, historyEmpty, historyFeedback, historyPageState, historyNewerState,
    historyEarlierState, historyPrevious, historyNext, historyResults, historyResultsList,
    historyContext
  },
  pageSize, searchPageSize, earlierLoadThreshold, messageView, group = {}}) {
  const state = {
    gid: group.gid || null, page: 1, total: 0, query: null, targetMid: null,
    beforeCursor: null, afterCursor: null, loadingMore: false, requestVersion: 0,
    group
  };

  function historySummary(message) {
    if (message.videoUrl || message.mediaType === MEDIA_TYPE.VIDEO
      || (message.mediaType === MEDIA_TYPE.VIDEO_OR_REDPACKET
        && !(message.text || "").includes(RED_PACKET_TEXT))) return "[视频]";
    if (message.mediaType === MEDIA_TYPE.WEIBO_CARD) return "[微博]";
    if (message.mediaType === MEDIA_TYPE.IMAGE || message.previewUrl) return "[图片]";
    return message.text?.trim() || `[${message.msgTypeName || "消息"}]`;
  }

  function reset() {
    const start = calendarMonthsAgo(new Date(), 3);
    state.requestVersion += 1;
    state.page = 1; state.total = 0; state.query = null; state.targetMid = null;
    state.beforeCursor = null; state.afterCursor = null; state.loadingMore = false;
    historyStart.value = localDateValue(start);
    historyEnd.value = localDateValue(new Date());
    const syncDate = new Date(); syncDate.setFullYear(syncDate.getFullYear() - 2);
    historySyncTime.value = localDateValue(syncDate);
    historySender.value = ""; historyKeyword.value = "";
    historyResultsList.replaceChildren(); historyMessages.replaceChildren();
    historyEarlierState.textContent = ""; historyNewerState.textContent = "";
    historyPageState.textContent = ""; historyResults.hidden = true;
    historyContext.hidden = true; historyEmpty.hidden = false;
    historyEmpty.textContent = "设置筛选条件后点击查询";
    historyFeedback.textContent = "";
  }

  function renderResults(items) {
    historyResultsList.replaceChildren(...items.map(message => {
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
    historyPageState.textContent = `第 ${state.page} / ${pageCount} 页，共 ${state.total} 条`;
    historyPrevious.disabled = state.page <= 1;
    historyNext.disabled = state.page >= pageCount;
    historyEmpty.hidden = true; historyContext.hidden = true; historyResults.hidden = false;
    historyResultsList.scrollTop = 0;
  }

  function messageElements(messages) {
    return [...messages].sort(compareMessages).map(message => messageView.messageElement(message, state.targetMid));
  }

  function updateEdges() {
    historyEarlierState.textContent = state.beforeCursor ? "向上滚动加载更早消息" : "没有更早消息";
    historyNewerState.textContent = state.afterCursor ? "向下滚动加载更新消息" : "没有更新消息";
  }

  function scrollMessageToStart(message) {
    const containerTop = historyMessages.getBoundingClientRect().top;
    const paddingTop = Number.parseFloat(getComputedStyle(historyMessages).paddingTop) || 0;
    historyMessages.scrollTop += message.getBoundingClientRect().top
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
    state.beforeCursor = null; state.afterCursor = null; historyResults.hidden = true;
    historyContext.hidden = false; historyEarlierState.textContent = "";
    historyNewerState.textContent = ""; historyFeedback.textContent = "";
    historyMessages.replaceChildren(...messageElements([target]));
    try {
      const [before, after] = await Promise.all([cursorRequest("before", target), cursorRequest("after", target)]);
      if (version !== state.requestVersion) return;
      state.beforeCursor = before.hasMore ? {createdAt: before.nextBeforeCreatedAt, mid: before.nextBeforeMid} : null;
      state.afterCursor = after.hasMore ? {createdAt: after.nextAfterCreatedAt, mid: after.nextAfterMid} : null;
      historyMessages.replaceChildren(...messageElements([...before.items, target, ...after.items]));
      updateEdges();
      historyMessages.querySelector(`[data-mid="${target.mid}"]`)?.scrollIntoView({block: "center"});
    } catch {
      if (version === state.requestVersion) historyFeedback.textContent = "消息上下文加载失败，请返回后重试。";
    }
  }

  async function loadMore(direction) {
    const earlier = direction === "before";
    const cursor = earlier ? state.beforeCursor : state.afterCursor;
    if (!cursor || state.loadingMore) return;
    state.loadingMore = true;
    const version = state.requestVersion;
    const anchor = earlier ? captureScrollAnchor(historyMessages) : null;
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
        historyMessages.prepend(...loaded);
        restoreScrollAnchor(anchor, historyMessages);
      } else {
        state.afterCursor = next;
        historyMessages.append(...loaded);
        if (loaded[0]) scrollMessageToStart(loaded[0]);
      }
      updateEdges();
    } catch {
      if (version === state.requestVersion) {
        (earlier ? historyEarlierState : historyNewerState).textContent
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
    historyEmpty.hidden = true; historyContext.hidden = true;
    try {
      const result = await fetchJson(`/chat/messages?${query}`, {cache: "no-store"});
      if (version !== state.requestVersion) return;
      state.page = result.page; state.total = result.total;
      renderResults(result.items);
      historyFeedback.textContent = result.items.length ? "" : "没有符合条件的聊天记录";
    } catch {
      if (version === state.requestVersion) {
        historyResults.hidden = true;
        historyFeedback.textContent = "聊天记录查询失败，请稍后重试。";
      }
    }
  }

  // /chat/since 成功时返回 204 无响应体，fetchJson 的 response.json() 会解析失败，
  // 这里必须用裸 fetch
  async function requestHistorySync() {
    if (!state.gid) return;
    historyEmpty.hidden = true; historyResults.hidden = true; historyContext.hidden = true;
    const raw = historySyncTime.value;
    if (!raw) { historyFeedback.textContent = "请先选择要同步到的历史日期。"; return; }
    const version = ++state.requestVersion;
    try {
      const query = new URLSearchParams({gid: String(state.gid), sinceTime: `${raw} 00:00:00`});
      const response = await fetch(`/chat/since?${query}`, {method: "POST"});
      if (!response.ok) throw new Error();
      if (version === state.requestVersion) historyFeedback.textContent = "已开始同步更早的历史消息，稍后请手动刷新查看。";
    } catch {
      if (version === state.requestVersion) historyFeedback.textContent = "同步历史请求失败，请稍后重试。";
    }
  }

  function close() {
    state.requestVersion += 1;
    if (historyDialog.open) historyDialog.close();
  }

  function open() {
    reset();
    historyDialog.showModal();
  }

  function setGroup(nextGroup) {
    state.gid = nextGroup.gid; state.group = nextGroup;
    historyOpen.disabled = false;
    historyTitle.textContent = `聊天记录 - ${nextGroup.name || `群聊 ${nextGroup.gid}`}`;
  }

  historyOpen.addEventListener("click", open);
  historyClose.addEventListener("click", close);
  historyForm.addEventListener("submit", event => {
    event.preventDefault();
    state.query = {
      start: historyStart.value, end: historyEnd.value,
      sender: historySender.value.trim(), keyword: historyKeyword.value.trim()
    };
    query(1);
  });
  historyPrevious.addEventListener("click", () => query(state.page - 1));
  historyNext.addEventListener("click", () => query(state.page + 1));
  historySync.addEventListener("click", requestHistorySync);
  historyBack.addEventListener("click", () => {
    state.requestVersion += 1;
    historyContext.hidden = true;
    historyFeedback.textContent = "";
    historyResults.hidden = false;
  });
  historyMessages.addEventListener("scroll", () => {
    if (historyMessages.scrollHeight <= historyMessages.clientHeight) return;
    if (historyMessages.scrollTop <= earlierLoadThreshold) {
      void loadMore("before");
      return;
    }
    const distance = historyMessages.scrollHeight
      - historyMessages.scrollTop - historyMessages.clientHeight;
    if (distance <= earlierLoadThreshold) void loadMore("after");
  });

  return {open, close, setGroup};
}
