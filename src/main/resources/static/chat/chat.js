(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const EARLIER_LOAD_THRESHOLD = 120;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const MESSAGE_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%\[\]-]+/g;
  const elements = {
    appTitle: document.querySelector("#app-title"),
    groupsCount: document.querySelector("#groups-count"),
    groupsList: document.querySelector("#groups-list"),
    groupsState: document.querySelector("#groups-state"),
    retryGroups: document.querySelector("#retry-groups"),
    groupSearch: document.querySelector("#group-search"),
    currentGroup: document.querySelector("#current-group"),
    currentSize: document.querySelector("#current-size"),
    currentId: document.querySelector("#current-id"),
    currentNotice: document.querySelector("#current-notice"),
    currentAvatar: document.querySelector("#current-group-avatar"),
    messages: document.querySelector("#messages"),
    messagesState: document.querySelector("#messages-state"),
    retryMessages: document.querySelector("#retry-messages"),
    loadEarlier: document.querySelector("#load-earlier"),
    newMessages: document.querySelector("#new-messages"),
    historyOpen: document.querySelector("#history-open"),
    historyDialog: document.querySelector("#history-dialog"),
    historyClose: document.querySelector("#history-close"),
    historyTitle: document.querySelector("#history-title"),
    historyForm: document.querySelector("#history-form"),
    historyStart: document.querySelector("#history-start"),
    historyEnd: document.querySelector("#history-end"),
    historySender: document.querySelector("#history-sender"),
    historyKeyword: document.querySelector("#history-keyword"),
    historyEmpty: document.querySelector("#history-empty"),
    historyResults: document.querySelector("#history-results"),
    historyResultsList: document.querySelector("#history-results-list"),
    historyContext: document.querySelector("#history-context"),
    historyBack: document.querySelector("#history-back"),
    historyMessages: document.querySelector("#history-messages"),
    historyEarlierState: document.querySelector("#history-earlier-state"),
    historyNewerState: document.querySelector("#history-newer-state"),
    historyFeedback: document.querySelector("#history-feedback"),
    historyPrevious: document.querySelector("#history-previous"),
    historyNext: document.querySelector("#history-next"),
    historyPageState: document.querySelector("#history-page-state"),
    imageViewer: document.querySelector("#image-viewer"),
    imageViewerImage: document.querySelector("#image-viewer img"),
    imageViewerState: document.querySelector("#image-viewer-state")
  };
  const state = {
    groups: [],
    currentGid: null,
    messages: new Map(),
    nextBeforeCreatedAt: null,
    nextBeforeMid: null,
    hasMore: false,
    refreshingGroups: false,
    refreshing: false,
    loadingEarlier: false,
    followingLatest: true,
    failedBeforeCreatedAt: null,
    failedBeforeMid: null
  };
  const historyState = {
    gid: null,
    page: 1,
    total: 0,
    query: null,
    targetMid: null,
    beforeCursor: null,
    afterCursor: null,
    loadingMore: false,
    requestVersion: 0
  };

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function calendarMonthsAgo(date, months) {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() - months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }

  function resetHistory(gid) {
    const start = calendarMonthsAgo(new Date(), 3);
    historyState.requestVersion += 1;
    historyState.gid = gid;
    historyState.page = 1;
    historyState.total = 0;
    historyState.query = null;
    historyState.targetMid = null;
    historyState.beforeCursor = null;
    historyState.afterCursor = null;
    historyState.loadingMore = false;
    elements.historyStart.value = localDateValue(start);
    elements.historyEnd.value = localDateValue(new Date());
    elements.historySender.value = "";
    elements.historyKeyword.value = "";
    elements.historyResultsList.replaceChildren();
    elements.historyMessages.replaceChildren();
    elements.historyEarlierState.textContent = "";
    elements.historyNewerState.textContent = "";
    elements.historyPageState.textContent = "";
    elements.historyResults.hidden = true;
    elements.historyContext.hidden = true;
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.textContent = "设置筛选条件后点击查询";
    elements.historyFeedback.textContent = "";
  }

  function initials(value, fallback) {
    return value?.trim().slice(0, 1) || fallback;
  }

  function avatar(group, className, profileUrl) {
    const container = document.createElement(profileUrl ? "a" : "span");
    container.className = className;
    if (profileUrl) {
      container.href = profileUrl;
      container.target = "_blank";
      container.rel = "noopener noreferrer";
      container.setAttribute("aria-label", `查看${group.name || "群友"}的微博主页`);
    } else {
      container.setAttribute("aria-hidden", "true");
    }
    if (group.avatar) {
      const image = document.createElement("img");
      image.src = `/chat/image?${new URLSearchParams({url: group.avatar})}`;
      image.alt = "";
      container.append(image);
    } else {
      container.textContent = initials(group.name, "群");
    }
    return container;
  }

  function appendMessageText(container, text) {
    let offset = 0;
    for (const match of text.matchAll(MESSAGE_URL_PATTERN)) {
      container.append(document.createTextNode(text.slice(offset, match.index)));
      const link = document.createElement("a");
      link.href = match[0];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[0];
      container.append(link);
      offset = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(offset)));
  }

  function groupPreview(group) {
    const sender = group.latestSenderName?.trim() || "";
    const message = group.latestMessage?.trim() || "";
    if (sender || message) {
      return sender ? `${sender}：${message}` : message;
    }
    return `${group.maxMember || group.memberCount} 人群`;
  }

  function renderGroups() {
    elements.groupsList.replaceChildren();
    state.groups.forEach(group => {
      const button = document.createElement("button");
      button.className = "group-row";
      button.type = "button";
      button.dataset.gid = String(group.gid);
      if (group.gid === state.currentGid) {
        button.classList.add("active");
        button.setAttribute("aria-current", "true");
      }
      const previewText = groupPreview(group);
      button.setAttribute("aria-label",
        `${group.name || `群聊 ${group.gid}`}，${previewText}`);
      button.append(avatar(group, "group-avatar"));
      const copy = document.createElement("span");
      copy.className = "group-copy";
      const name = document.createElement("span");
      name.className = "group-name";
      name.textContent = group.name || `群聊 ${group.gid}`;
      const size = document.createElement("span");
      size.className = "group-preview";
      size.textContent = previewText;
      copy.append(name, size);
      button.append(copy);
      button.addEventListener("click", () => selectGroup(group.gid));
      elements.groupsList.append(button);
    });
    elements.groupsCount.textContent = `${state.groups.length} 个群聊`;
    filterGroups(elements.groupSearch.value);
  }

  function filterGroups(value) {
    const keyword = value.trim().toLocaleLowerCase("zh-CN");
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(keyword);
    });
  }

  function messageElement(message, targetMid = null, onMediaLoad = null) {
      const article = document.createElement("article");
      article.className = "message";
      article.dataset.mid = String(message.mid);
      if (message.mid === targetMid) article.classList.add("target-message");
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      appendMessageText(bubble, message.text || `[${message.msgTypeName || "消息"}]`);
      if (message.senderName?.trim() === "粉丝群") {
        article.classList.add("system-message");
        article.append(bubble);
        return article;
      }
      article.append(avatar({
        name: message.senderName,
        avatar: message.senderAvatar
      }, "message-avatar", Number.isSafeInteger(message.senderId) && message.senderId > 0
        ? `https://weibo.com/u/${message.senderId}`
        : ""));
      const content = document.createElement("div");
      content.className = "message-content";
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `${message.senderName || "未知成员"} · ${formatTime(message.createdAt)}`;
      const media = messageMedia(message, onMediaLoad);
      const hidesMediaLabel = media
        && ["分享图片", "分享视频"].includes(message.text?.trim());
      content.append(meta);
      if (!hidesMediaLabel) content.append(bubble);
      if (media) content.append(media);
      article.append(content);
      return article;
  }

  function renderMessages() {
    const ordered = [...state.messages.values()].sort((left, right) =>
      left.createdAt - right.createdAt || left.mid - right.mid);
    elements.messages.replaceChildren(...ordered.map(message => messageElement(
      message, null, () => {
        if (state.followingLatest) elements.messages.scrollTop = elements.messages.scrollHeight;
      })));
  }

  function messageMedia(message, onLoad) {
    if (!message.previewUrl) return null;
    const button = document.createElement("button");
    button.type = "button";
    const image = document.createElement("img");
    image.src = message.previewUrl;
    image.loading = "lazy";
    image.alt = "";
    if (onLoad) image.addEventListener("load", onLoad);
    button.append(image);
    const label = document.createElement("span");
    if (message.videoUrl) {
      button.className = "media-preview video-preview";
      button.setAttribute("aria-label", "播放视频");
      label.textContent = "▶";
      button.append(label);
      button.addEventListener("click", () => {
        const video = document.createElement("video");
        video.src = message.videoUrl;
        video.controls = true;
        video.preload = "metadata";
        video.setAttribute("aria-label", "群聊视频");
        button.replaceWith(video);
        video.play().catch(() => {
          video.controls = true;
        });
      }, {once: true});
    } else {
      button.className = "media-preview image-preview";
      button.setAttribute("aria-label", "查看原图");
      button.addEventListener("click", () => openImage(message.originalUrl || message.previewUrl));
    }
    image.addEventListener("error", () => {
      image.hidden = true;
      label.textContent = "媒体加载失败，点击重试";
      button.append(label);
      button.classList.add("media-failed");
    }, {once: true});
    return button;
  }

  function openImage(url) {
    elements.imageViewerImage.hidden = true;
    elements.imageViewerState.textContent = "正在加载原图…";
    elements.imageViewerImage.src = url;
    elements.imageViewer.showModal();
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hour12: false
    }).format(new Date(timestamp));
  }

  function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(timestamp));
  }

  function historySummary(message) {
    const text = message.text?.trim() || "";
    const video = message.mediaType === 10
      || (message.mediaType === 13 && !text.includes("收到红包消息"));
    if (video || message.videoUrl) return "[视频]";
    if (message.mediaType === 1 || message.previewUrl) return "[图片]";
    return message.text?.trim() || `[${message.msgTypeName || "消息"}]`;
  }

  function appendHighlightedText(element, value, keyword) {
    const text = value || "";
    const needle = keyword?.trim() || "";
    if (!needle) {
      element.textContent = text;
      return;
    }
    const lowerText = text.toLocaleLowerCase();
    const lowerNeedle = needle.toLocaleLowerCase();
    let start = 0;
    let match = lowerText.indexOf(lowerNeedle, start);
    while (match >= 0) {
      element.append(document.createTextNode(text.slice(start, match)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(match, match + needle.length);
      element.append(mark);
      start = match + needle.length;
      match = lowerText.indexOf(lowerNeedle, start);
    }
    element.append(document.createTextNode(text.slice(start)));
  }

  function renderHistoryResults(items) {
    elements.historyResultsList.replaceChildren(...items.map(message => {
      const button = document.createElement("button");
      button.className = "history-result";
      button.type = "button";
      button.dataset.mid = String(message.mid);
      const time = document.createElement("span");
      time.className = "history-result-time";
      time.textContent = formatDateTime(message.createdAt);
      const sender = document.createElement("span");
      sender.className = "history-result-sender";
      sender.textContent = message.senderName || "未知成员";
      const summary = document.createElement("span");
      summary.className = "history-result-summary";
      appendHighlightedText(summary, historySummary(message), historyState.query?.keyword);
      button.append(time, sender, summary);
      button.addEventListener("click", () => openHistoryContext(message));
      return button;
    }));
    elements.historyResultsList.scrollTop = 0;
    const pageCount = Math.max(1, Math.ceil(historyState.total / HISTORY_SEARCH_PAGE_SIZE));
    elements.historyPageState.textContent =
      `第 ${historyState.page} / ${pageCount} 页，共 ${historyState.total} 条`;
    elements.historyPrevious.disabled = historyState.page <= 1;
    elements.historyNext.disabled = historyState.page >= pageCount;
    elements.historyEmpty.hidden = true;
    elements.historyContext.hidden = true;
    elements.historyResults.hidden = false;
  }

  function compareMessages(left, right) {
    return left.createdAt - right.createdAt || left.mid - right.mid;
  }

  function historyMessageElements(messages) {
    return [...messages].sort(compareMessages)
      .map(message => messageElement(message, historyState.targetMid));
  }

  function renderHistoryMessages(messages) {
    elements.historyMessages.replaceChildren(...historyMessageElements(messages));
  }

  function updateHistoryEdges() {
    elements.historyEarlierState.textContent = historyState.beforeCursor
      ? "向上滚动加载更早消息" : "没有更早消息";
    elements.historyNewerState.textContent = historyState.afterCursor
      ? "向下滚动加载更新消息" : "没有更新消息";
  }

  function scrollHistoryMessageToStart(message) {
    const containerTop = elements.historyMessages.getBoundingClientRect().top;
    const paddingTop = Number.parseFloat(getComputedStyle(elements.historyMessages).paddingTop) || 0;
    elements.historyMessages.scrollTop += message.getBoundingClientRect().top
      - containerTop - paddingTop;
  }

  async function fetchHistoryCursor(direction, message, gid = historyState.gid) {
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    query.set(`${direction}CreatedAt`, String(message.createdAt));
    query.set(`${direction}Mid`, String(message.mid));
    const response = await fetch(`/chat/messages/cursor?${query}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function openHistoryContext(target) {
    const requestVersion = ++historyState.requestVersion;
    const gid = historyState.gid;
    historyState.loadingMore = false;
    historyState.targetMid = target.mid;
    historyState.beforeCursor = null;
    historyState.afterCursor = null;
    elements.historyResults.hidden = true;
    elements.historyContext.hidden = false;
    elements.historyEarlierState.textContent = "";
    elements.historyNewerState.textContent = "";
    renderHistoryMessages([target]);
    elements.historyFeedback.textContent = "";
    try {
      const [before, after] = await Promise.all([
        fetchHistoryCursor("before", target, gid),
        fetchHistoryCursor("after", target, gid)
      ]);
      if (requestVersion !== historyState.requestVersion) return;
      historyState.beforeCursor = before.hasMore ? {
        createdAt: before.nextBeforeCreatedAt,
        mid: before.nextBeforeMid
      } : null;
      historyState.afterCursor = after.hasMore ? {
        createdAt: after.nextAfterCreatedAt,
        mid: after.nextAfterMid
      } : null;
      renderHistoryMessages([...before.items, target, ...after.items]);
      updateHistoryEdges();
      elements.historyFeedback.textContent = "";
      elements.historyMessages.querySelector(`[data-mid="${target.mid}"]`)
        ?.scrollIntoView({block: "center"});
    } catch {
      if (requestVersion !== historyState.requestVersion) return;
      elements.historyFeedback.textContent = "消息上下文加载失败，请返回后重试。";
    }
  }

  async function loadMoreHistory(direction) {
    const earlier = direction === "before";
    const cursor = earlier ? historyState.beforeCursor : historyState.afterCursor;
    if (!cursor || historyState.loadingMore) return;
    historyState.loadingMore = true;
    const requestVersion = historyState.requestVersion;
    const gid = historyState.gid;
    const anchor = earlier ? captureScrollAnchor(elements.historyMessages) : null;
    try {
      const result = await fetchHistoryCursor(direction, cursor, gid);
      if (requestVersion !== historyState.requestVersion) return;
      const loaded = historyMessageElements(result.items);
      const nextCursor = result.hasMore ? {
        createdAt: earlier ? result.nextBeforeCreatedAt : result.nextAfterCreatedAt,
        mid: earlier ? result.nextBeforeMid : result.nextAfterMid
      } : null;
      if (earlier) {
        historyState.beforeCursor = nextCursor;
        elements.historyMessages.prepend(...loaded);
        restoreScrollAnchor(anchor, elements.historyMessages);
      } else {
        historyState.afterCursor = nextCursor;
        elements.historyMessages.append(...loaded);
        if (loaded[0]) scrollHistoryMessageToStart(loaded[0]);
      }
      updateHistoryEdges();
    } catch {
      if (requestVersion !== historyState.requestVersion) return;
      const edge = earlier ? elements.historyEarlierState : elements.historyNewerState;
      edge.textContent = earlier ? "更早消息加载失败" : "更新消息加载失败";
    } finally {
      if (requestVersion === historyState.requestVersion) historyState.loadingMore = false;
    }
  }

  async function queryHistory(page) {
    const requestVersion = ++historyState.requestVersion;
    const gid = historyState.gid;
    elements.historyEmpty.hidden = true;
    elements.historyContext.hidden = true;
    const query = new URLSearchParams({
      gid: String(gid),
      page: String(page),
      size: String(HISTORY_SEARCH_PAGE_SIZE)
    });
    const filters = historyState.query;
    if (filters.start) query.set("start", `${filters.start} 00:00:00`);
    if (filters.end) query.set("end", `${filters.end} 23:59:59`);
    if (filters.sender) query.set("senderName", filters.sender);
    if (filters.keyword) query.set("keyword", filters.keyword);
    try {
      const response = await fetch(`/chat/messages?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (requestVersion !== historyState.requestVersion) return;
      historyState.page = result.page;
      historyState.total = result.total;
      renderHistoryResults(result.items);
      elements.historyFeedback.textContent = result.items.length ? "" : "没有符合条件的聊天记录";
    } catch {
      if (requestVersion !== historyState.requestVersion) return;
      elements.historyResults.hidden = true;
      elements.historyFeedback.textContent = "聊天记录查询失败，请稍后重试。";
    }
  }

  function captureScrollAnchor(container = elements.messages) {
    const containerTop = container.getBoundingClientRect().top;
    const anchor = [...container.children].find(element =>
      element.getBoundingClientRect().bottom > containerTop);
    if (!anchor) return null;
    return {
      mid: anchor.dataset.mid,
      top: anchor.getBoundingClientRect().top
    };
  }

  function restoreScrollAnchor(anchor, container = elements.messages) {
    if (!anchor) return;
    const renderedAnchor = container.querySelector(`[data-mid="${anchor.mid}"]`);
    if (renderedAnchor) {
      container.scrollTop += renderedAnchor.getBoundingClientRect().top - anchor.top;
    }
  }

  async function selectGroup(gid) {
    const group = state.groups.find(item => item.gid === gid);
    if (!group) return;
    if (historyState.gid !== gid) resetHistory(gid);
    state.currentGid = gid;
    state.messages.clear();
    state.nextBeforeCreatedAt = null;
    state.nextBeforeMid = null;
    state.hasMore = false;
    elements.newMessages.hidden = true;
    elements.loadEarlier.disabled = true;
    elements.loadEarlier.hidden = true;
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    elements.currentSize.textContent = `${group.maxMember || group.memberCount} 人群`;
    elements.currentId.textContent = String(group.gid);
    elements.currentNotice.textContent = group.summary || "暂无简介";
    elements.historyOpen.disabled = false;
    elements.historyTitle.textContent = `聊天记录 - ${group.name || `群聊 ${group.gid}`}`;
    elements.currentAvatar.replaceWith(avatar(group, "main-group-avatar"));
    elements.currentAvatar = document.querySelector(".main-group-avatar");
    elements.appTitle.textContent = `微博群聊 - ${elements.currentGroup.textContent}`;
    document.title = elements.appTitle.textContent;
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      const active = row.dataset.gid === String(gid);
      row.classList.toggle("active", active);
      if (active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
    await loadMessages(null, null);
  }

  async function loadMessages(beforeCreatedAt = null, beforeMid = null) {
    const isLatestPage = beforeCreatedAt === null && beforeMid === null;
    const anchor = isLatestPage ? null : captureScrollAnchor();
    state.failedBeforeCreatedAt = beforeCreatedAt;
    state.failedBeforeMid = beforeMid;
    elements.retryMessages.hidden = true;
    const query = new URLSearchParams({
      gid: String(state.currentGid), size: String(PAGE_SIZE)
    });
    if (!isLatestPage) {
      query.set("beforeCreatedAt", String(beforeCreatedAt));
      query.set("beforeMid", String(beforeMid));
    }
    try {
      const response = await fetch(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.nextBeforeCreatedAt = result.nextBeforeCreatedAt;
      state.nextBeforeMid = result.nextBeforeMid;
      state.hasMore = result.hasMore;
      if (isLatestPage) state.followingLatest = true;
      renderMessages();
      elements.messagesState.textContent = state.messages.size ? "" : "暂无消息";
      elements.loadEarlier.disabled = !state.hasMore;
      if (isLatestPage) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      } else {
        restoreScrollAnchor(anchor);
      }
    } catch {
      elements.messagesState.textContent = "消息加载失败，请稍后重试。";
      elements.retryMessages.hidden = false;
    }
  }

  function isNearBottom() {
    return elements.messages.scrollHeight
      - elements.messages.scrollTop
      - elements.messages.clientHeight < 80;
  }

  async function maybeLoadEarlierMessages() {
    if (!state.currentGid || !state.hasMore || state.loadingEarlier || state.refreshing) return;
    if (elements.messages.scrollTop > EARLIER_LOAD_THRESHOLD
      || elements.messages.scrollHeight <= elements.messages.clientHeight) return;
    if (state.nextBeforeCreatedAt === null || state.nextBeforeMid === null) return;
    state.loadingEarlier = true;
    try {
      await loadMessages(state.nextBeforeCreatedAt, state.nextBeforeMid);
    } finally {
      state.loadingEarlier = false;
    }
  }

  async function refreshMessages() {
    if (!state.currentGid || state.refreshing || state.loadingEarlier || document.hidden) return;
    state.refreshing = true;
    const followedLatest = isNearBottom();
    const knownMids = new Set(state.messages.keys());
    const query = new URLSearchParams({
      gid: String(state.currentGid), size: String(PAGE_SIZE)
    });
    try {
      const response = await fetch(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      result.items.forEach(message => state.messages.set(message.mid, message));
      const added = result.items.some(message => !knownMids.has(message.mid));
      if (added) {
        state.followingLatest = followedLatest;
        renderMessages();
        if (followedLatest) {
          elements.messages.scrollTop = elements.messages.scrollHeight;
        } else {
          elements.newMessages.hidden = false;
        }
      }
      elements.loadEarlier.disabled = !state.hasMore;
    } catch {
    } finally {
      state.refreshing = false;
      maybeLoadEarlierMessages();
    }
  }

  async function refreshGroups() {
    if (state.refreshingGroups || document.hidden) return;
    state.refreshingGroups = true;
    try {
      const response = await fetch("/chat/groups", {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const groups = await response.json();
      if (JSON.stringify(groups) === JSON.stringify(state.groups)) return;
      state.groups = groups;
      renderGroups();
    } catch {
    } finally {
      state.refreshingGroups = false;
    }
  }

  function refreshView() {
    refreshGroups();
    refreshMessages();
  }

  async function initialize() {
    elements.retryGroups.hidden = true;
    elements.groupsState.textContent = "";
    try {
      const response = await fetch("/chat/groups", {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.groups = await response.json();
      renderGroups();
      if (!state.groups.length) {
        elements.groupsState.textContent = "本地还没有群聊数据。";
        return;
      }
      const savedGid = Number(localStorage.getItem(LAST_GROUP_KEY));
      const initial = state.groups.find(group => group.gid === savedGid) || state.groups[0];
      await selectGroup(initial.gid);
    } catch {
      elements.groupsCount.textContent = "加载失败";
      elements.groupsState.textContent = "群聊列表加载失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    }
  }

  elements.groupSearch.addEventListener("input", event => {
    filterGroups(event.target.value);
  });
  elements.messages.addEventListener("scroll", () => {
    state.followingLatest = isNearBottom();
    if (state.followingLatest) elements.newMessages.hidden = true;
    maybeLoadEarlierMessages();
  });
  elements.retryGroups.addEventListener("click", initialize);
  elements.retryMessages.addEventListener("click", () =>
    loadMessages(state.failedBeforeCreatedAt, state.failedBeforeMid));
  elements.newMessages.addEventListener("click", async () => {
    await refreshMessages();
    state.followingLatest = true;
    elements.messages.scrollTop = elements.messages.scrollHeight;
    elements.newMessages.hidden = true;
  });
  elements.historyOpen.addEventListener("click", () => {
    resetHistory(state.currentGid);
    elements.historyDialog.showModal();
  });
  elements.historyClose.addEventListener("click", () => elements.historyDialog.close());
  elements.historyForm.addEventListener("submit", event => {
    event.preventDefault();
    historyState.query = {
      start: elements.historyStart.value,
      end: elements.historyEnd.value,
      sender: elements.historySender.value.trim(),
      keyword: elements.historyKeyword.value.trim()
    };
    queryHistory(1);
  });
  elements.historyPrevious.addEventListener("click", () => queryHistory(historyState.page - 1));
  elements.historyNext.addEventListener("click", () => queryHistory(historyState.page + 1));
  elements.historyBack.addEventListener("click", () => {
    historyState.requestVersion += 1;
    elements.historyContext.hidden = true;
    elements.historyFeedback.textContent = "";
    elements.historyResults.hidden = false;
  });
  elements.historyMessages.addEventListener("scroll", () => {
    if (elements.historyMessages.scrollHeight <= elements.historyMessages.clientHeight) return;
    if (elements.historyMessages.scrollTop <= EARLIER_LOAD_THRESHOLD) {
      loadMoreHistory("before");
      return;
    }
    const distanceFromBottom = elements.historyMessages.scrollHeight
      - elements.historyMessages.scrollTop - elements.historyMessages.clientHeight;
    if (distanceFromBottom <= EARLIER_LOAD_THRESHOLD) loadMoreHistory("after");
  });
  elements.imageViewer.addEventListener("click", event => {
    if (event.target === elements.imageViewer) elements.imageViewer.close();
  });
  elements.imageViewerImage.addEventListener("load", () => {
    elements.imageViewerImage.hidden = false;
    elements.imageViewerState.textContent = "";
  });
  elements.imageViewerImage.addEventListener("error", () => {
    elements.imageViewerImage.hidden = true;
    elements.imageViewerState.textContent = "原图加载失败，请关闭后重试。";
  });
  window.addEventListener("focus", refreshView);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshView();
  });
  setInterval(refreshView, 2_000);

  initialize();
})();
