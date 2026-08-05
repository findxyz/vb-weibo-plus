(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const EARLIER_LOAD_THRESHOLD = 120;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const MESSAGE_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%\[\]-]+/g;
  const EMOJI_PHRASE_PATTERN = /\[[^\[\]]+\]/g;
  const EMOJI_IMAGE_TEST = /\[(\/[0-9a-z]+\.png)\]/i;
  const EMOJI_IMAGE_BASE = "https://img.t.sinajs.cn/t4/appstyle/expression/emimage";
  const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};
  const WEIBO_EMOJI_MAP = (typeof window !== "undefined" && window.WEIBO_EMOJI_MAP) || {};
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
    currentAvatar: document.querySelector("#current-group-avatar"),
    messages: document.querySelector("#messages"),
    messagesState: document.querySelector("#messages-state"),
    retryMessages: document.querySelector("#retry-messages"),
    loadEarlier: document.querySelector("#load-earlier"),
    newMessages: document.querySelector("#new-messages"),
    historyOpen: document.querySelector("#history-open"),
    emojiPickerOpen: document.querySelector("#emoji-picker-open"),
    emojiPanel: document.querySelector("#emoji-panel"),
    emojiPanelGrid: document.querySelector("#emoji-panel-grid"),
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
    historySyncTime: document.querySelector("#history-sync-time"),
    historySync: document.querySelector("#history-sync"),
    imageViewer: document.querySelector("#image-viewer"),
    imageViewerImage: document.querySelector("#image-viewer img"),
    imageViewerState: document.querySelector("#image-viewer-state"),
    composer: document.querySelector("#composer"),
    composerHint: document.querySelector("#composer-hint"),
    composerAttachment: document.querySelector("#composer-attachment"),
    composerAttachmentPreview: document.querySelector("#composer-attachment-preview"),
    composerAttachmentPreviewVideo: document.querySelector("#composer-attachment-preview-video"),
    composerAttachmentRemove: document.querySelector("#composer-attachment-remove"),
    imagePickerOpen: document.querySelector("#image-picker-open"),
    imageInput: document.querySelector("#image-input"),
    videoPickerOpen: document.querySelector("#video-picker-open"),
    videoInput: document.querySelector("#video-input"),
    loginExpired: document.querySelector("#login-expired"),
    loginQr: document.querySelector("#login-qr"),
    windowToggle: document.querySelector(".window-control.toggle")
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
    failedBeforeMid: null,
    sending: false,
    pendingImage: null,
    pendingImageUrl: null,
    pendingVideo: null,
    pendingVideoUrl: null,
    lastSizeGid: null,
    lastMessageCount: null,
    loginCheckTick: 0,
    loginPending: false
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

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

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
    const syncDate = new Date();
    syncDate.setFullYear(syncDate.getFullYear() - 2);
    elements.historySyncTime.value = localDateValue(syncDate);
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

  function emojiImageUrl(token) {
    const imageMatch = token.match(EMOJI_IMAGE_TEST);
    if (imageMatch) {
      return EMOJI_IMAGE_BASE + imageMatch[1];
    }
    return WEIBO_EMOJI_MAP[token];
  }

  function appendTextSegment(container, text) {
    let offset = 0;
    for (const match of text.matchAll(EMOJI_PHRASE_PATTERN)) {
      const url = emojiImageUrl(match[0]);
      if (!url) continue;
      if (match.index > offset) {
        container.append(document.createTextNode(text.slice(offset, match.index)));
      }
      const img = document.createElement("img");
      img.className = "emoji";
      img.src = url;
      img.alt = match[0];
      img.loading = "lazy";
      container.append(img);
      offset = match.index + match[0].length;
    }
    if (offset < text.length) {
      container.append(document.createTextNode(text.slice(offset)));
    }
  }

  function appendMessageText(container, text) {
    let offset = 0;
    for (const match of text.matchAll(MESSAGE_URL_PATTERN)) {
      appendTextSegment(container, text.slice(offset, match.index));
      const link = document.createElement("a");
      link.href = match[0];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[0];
      container.append(link);
      offset = match.index + match[0].length;
    }
    appendTextSegment(container, text.slice(offset));
  }

  let emojiPanelBuilt = false;

  function buildEmojiPanel() {
    if (emojiPanelBuilt) return;
    const grid = elements.emojiPanelGrid;
    for (const [phrase, url] of Object.entries(WEIBO_EMOJI_MAP)) {
      const img = document.createElement("img");
      img.className = "emoji-cell";
      img.src = url;
      img.alt = phrase;
      img.title = phrase;
      img.loading = "lazy";
      grid.append(img);
    }
    emojiPanelBuilt = true;
  }

  function toggleEmojiPanel(forceOpen) {
    const open = forceOpen ?? elements.emojiPanel.hidden;
    if (open) {
      buildEmojiPanel();
      elements.emojiPanel.hidden = false;
    } else {
      elements.emojiPanel.hidden = true;
    }
  }

  function insertEmoji(phrase) {
    const composer = elements.composer;
    const start = composer.selectionStart ?? composer.value.length;
    const end = composer.selectionEnd ?? composer.value.length;
    composer.setRangeText(phrase, start, end, "end");
    composer.focus();
    composer.dispatchEvent(new Event("input", {bubbles: true}));
  }

  function appendWeiboCard(container, urlObject) {
    const status = urlObject.status || {};
    const author = status.user?.screen_name?.trim() || "";
    const rawText = (status.text || "").replace(/<[^>]+>/g, "").trim();
    const summary = rawText.length > 100 ? rawText.slice(0, 100) + "…" : rawText;
    const link = urlObject.url_ori || urlObject.info?.url_long || "";
    container.classList.add("weibo-card");
    if (author) {
      const authorEl = document.createElement("div");
      authorEl.className = "weibo-card-author";
      authorEl.textContent = author;
      container.append(authorEl);
    }
    if (summary) {
      const summaryEl = document.createElement("div");
      summaryEl.className = "weibo-card-summary";
      summaryEl.textContent = summary;
      container.append(summaryEl);
    }
    if (link) {
      const linkEl = document.createElement("a");
      linkEl.className = "weibo-card-link";
      linkEl.href = link;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = "查看微博";
      container.append(linkEl);
    }
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

  function isAdminSender(senderId) {
    if (!Number.isSafeInteger(senderId) || senderId <= 0) return false;
    const group = state.groups.find(item => item.gid === state.currentGid);
    return Array.isArray(group?.admins) && group.admins.includes(senderId);
  }

  function messageElement(message, targetMid, onMediaLoad = null) {
      const article = document.createElement("article");
      article.className = "message";
      article.dataset.mid = String(message.mid);
      if (message.mid === targetMid) article.classList.add("target-message");
      if (isAdminSender(message.senderId)) article.classList.add("admin-message");
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      if (message.fileUrl) {
        const link = document.createElement("a");
        link.className = "file-download";
        link.href = message.fileUrl;
        link.download = message.text || "";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = message.text || "下载文件";
        bubble.append(link);
      } else if (message.mediaType === MEDIA_TYPE.WEIBO_CARD && message.urlObjects?.[0]?.status) {
        appendWeiboCard(bubble, message.urlObjects[0]);
      } else {
        appendMessageText(bubble, message.text || `[${message.msgTypeName || "消息"}]`);
      }
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
        && ["分享图片", "分享视频", "[动画表情]"].includes(message.text?.trim());
      content.append(meta);
      if (!hidesMediaLabel) content.append(bubble);
      if (media) content.append(media);
      article.append(content);
      return article;
  }

  function renderMessages(forceFollow = false) {
    const ordered = [...state.messages.values()].sort((left, right) =>
      left.createdAt - right.createdAt || left.mid - right.mid);
    const onLoad = forceFollow ? () => scrollToBottom(true) : stickToBottom;
    elements.messages.replaceChildren(...ordered.map(message => messageElement(
      message, null, onLoad)));
  }

  function messageMedia(message, onLoad) {
    if (!message.previewUrl) return null;
    const button = document.createElement("button");
    button.type = "button";
    const image = document.createElement("img");
    // 首页/刷新的图片需要立即加载以触发 stickToBottom，懒加载会让 load 回调无法及时跟随到底部
    image.loading = onLoad ? "eager" : "lazy";
    image.alt = "";
    // 先注册 load 再设 src，避免缓存命中时 load 在监听前触发而漏掉跟随到底部
    if (onLoad) image.addEventListener("load", onLoad, {once: true});
    image.src = message.previewUrl;
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
      if (onLoad) onLoad();
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
    const video = message.mediaType === MEDIA_TYPE.VIDEO
      || (message.mediaType === MEDIA_TYPE.VIDEO_OR_REDPACKET && !text.includes("收到红包消息"));
    if (video || message.videoUrl) return "[视频]";
    if (message.mediaType === MEDIA_TYPE.WEIBO_CARD) return "[微博]";
    if (message.mediaType === MEDIA_TYPE.IMAGE || message.previewUrl) return "[图片]";
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
    const pageCount = Math.max(1, Math.ceil(historyState.total / HISTORY_SEARCH_PAGE_SIZE));
    elements.historyPageState.textContent =
      `第 ${historyState.page} / ${pageCount} 页，共 ${historyState.total} 条`;
    elements.historyPrevious.disabled = historyState.page <= 1;
    elements.historyNext.disabled = historyState.page >= pageCount;
    elements.historyEmpty.hidden = true;
    elements.historyContext.hidden = true;
    elements.historyResults.hidden = false;
    elements.historyResultsList.scrollTop = 0;
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

  async function fetchHistoryCursor(direction, message, gid) {
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    query.set(`${direction}CreatedAt`, String(message.createdAt));
    query.set(`${direction}Mid`, String(message.mid));
    return fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
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
      const result = await fetchJson(`/chat/messages?${query}`, {cache: "no-store"});
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

  async function captureHistory() {
    const gid = historyState.gid;
    if (!gid) return;
    elements.historyEmpty.hidden = true;
    elements.historyResults.hidden = true;
    elements.historyContext.hidden = true;
    const raw = elements.historySyncTime.value;
    if (!raw) {
      elements.historyFeedback.textContent = "请先选择要同步到的历史日期。";
      return;
    }
    const sinceTime = `${raw} 00:00:00`;
    const query = new URLSearchParams({gid: String(gid), sinceTime});
    try {
      const response = await fetch(`/chat/since?${query}`, {method: "POST"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      elements.historyFeedback.textContent = "已开始同步更早的历史消息，稍后请手动刷新查看。";
    } catch {
      elements.historyFeedback.textContent = "同步历史请求失败，请稍后重试。";
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
    updateCurrentGroupHeader();
    elements.currentId.textContent = String(group.gid);
    elements.historyOpen.disabled = false;
    elements.emojiPickerOpen.disabled = false;
    elements.imagePickerOpen.disabled = false;
    elements.videoPickerOpen.disabled = false;
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

  function updateCurrentGroupHeader() {
    if (!state.currentGid) return;
    const group = state.groups.find(item => item.gid === state.currentGid);
    if (!group) return;
    const hasCount = typeof group.messageCount === "number";
    if (hasCount) {
      const prefix = `${group.maxMember || group.memberCount} 人群 + `;
      let countEl = elements.currentSize.querySelector("#current-message-count");
      if (!countEl) {
        countEl = document.createElement("span");
        countEl.id = "current-message-count";
        elements.currentSize.replaceChildren(document.createTextNode(prefix), countEl,
                document.createTextNode(" 条消息"));
      } else {
        elements.currentSize.firstChild.textContent = prefix;
      }
      countEl.textContent = String(group.messageCount);
      if (state.lastSizeGid !== state.currentGid) {
        state.lastSizeGid = state.currentGid;
        state.lastMessageCount = group.messageCount;
        return;
      }
      if (group.messageCount !== state.lastMessageCount) {
        state.lastMessageCount = group.messageCount;
        flashSize(countEl);
      }
    } else {
      elements.currentSize.textContent = `${group.maxMember || group.memberCount} 人群`;
    }
  }

  function flashSize(el) {
    el.classList.remove("size-flash");
    void el.offsetWidth;
    el.classList.add("size-flash");
  }

  async function loadMessages(beforeCreatedAt = null, beforeMid = null) {
    const isLatestPage = beforeCreatedAt === null && beforeMid === null;
    const anchor = isLatestPage ? null : captureScrollAnchor();
    state.failedBeforeCreatedAt = beforeCreatedAt;
    state.failedBeforeMid = beforeMid;
    elements.retryMessages.hidden = true;
    const gid = state.currentGid;
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    if (!isLatestPage) {
      query.set("beforeCreatedAt", String(beforeCreatedAt));
      query.set("beforeMid", String(beforeMid));
    }
    try {
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid) return;
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.nextBeforeCreatedAt = result.nextBeforeCreatedAt;
      state.nextBeforeMid = result.nextBeforeMid;
      state.hasMore = result.hasMore;
      if (isLatestPage) state.followingLatest = true;
      renderMessages(isLatestPage);
      elements.messagesState.textContent = state.messages.size ? "" : "暂无消息";
      elements.loadEarlier.disabled = !state.hasMore;
      if (isLatestPage) {
        scrollToBottom(true);
      } else {
        restoreScrollAnchor(anchor);
      }
    } catch {
      if (state.currentGid !== gid) return;
      elements.messagesState.textContent = "消息加载失败，请稍后重试。";
      elements.retryMessages.hidden = false;
    }
  }

  function scrollToBottom(force = false) {
    if (force || state.followingLatest) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  }

  function stickToBottom() {
    scrollToBottom();
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
    const gid = state.currentGid;
    const followedLatest = isNearBottom();
    const knownMids = new Set(state.messages.keys());
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    try {
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid) return;
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
      if (state.currentGid === gid) maybeLoadEarlierMessages();
    }
  }

  async function refreshGroups() {
    if (state.refreshingGroups || document.hidden) return;
    state.refreshingGroups = true;
    try {
      const groups = await fetchJson("/chat/groups", {cache: "no-store"});
      if (JSON.stringify(groups) === JSON.stringify(state.groups)) return;
      state.groups = groups;
      renderGroups();
      updateCurrentGroupHeader();
    } catch {
    } finally {
      state.refreshingGroups = false;
    }
  }

  function refreshView() {
    refreshGroups();
    refreshMessages();
    maybeCheckLoginStatus();
  }

  const LOGIN_CHECK_INTERVAL = 60;
  const QR_LOGIN_LOADING_TEXT = "📱 扫码中…";

  function maybeCheckLoginStatus() {
    if (document.hidden || state.loginPending) return;
    state.loginCheckTick += 1;
    if (state.loginCheckTick < LOGIN_CHECK_INTERVAL) return;
    state.loginCheckTick = 0;
    checkLoginStatus();
  }

  async function checkLoginStatus() {
    try {
      const response = await fetch("/weibo/login/status", {cache: "no-store"});
      if (!response.ok) return;
      const result = await response.json();
      if (result.valid === false) {
        elements.loginExpired.hidden = false;
      } else {
        elements.loginExpired.hidden = true;
      }
    } catch {
    }
  }

  async function startQrLogin() {
    if (state.loginPending) return;
    state.loginPending = true;
    elements.loginQr.disabled = true;
    elements.loginQr.textContent = QR_LOGIN_LOADING_TEXT;
    try {
      const response = await fetch("/weibo/login/qr", {method: "POST"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      elements.loginExpired.hidden = true;
      await initialize();
    } catch {
      elements.groupsState.textContent = "扫码登录失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    } finally {
      state.loginPending = false;
      elements.loginQr.disabled = false;
      elements.loginQr.textContent = "📱 扫码登录";
    }
  }

  function setComposerHint(text, level) {
    elements.composerHint.textContent = text;
    elements.composerHint.classList.toggle("is-sending", level === "sending");
    elements.composerHint.classList.toggle("is-error", level === "error");
  }

  const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

  function setPendingImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setComposerHint("仅支持图片文件。", "error");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setComposerHint("图片不能超过 20MB。", "error");
      return;
    }
    clearPendingAttachment();
    state.pendingImage = file;
    state.pendingImageUrl = URL.createObjectURL(file);
    elements.composerAttachmentPreview.src = state.pendingImageUrl;
    elements.composerAttachmentPreview.hidden = false;
    elements.composerAttachmentPreviewVideo.hidden = true;
    elements.composerAttachment.hidden = false;
    elements.composerAttachment.focus();
    setComposerHint("按下 Enter 发送图片");
  }

  function setPendingVideo(file) {
    if (!file) return;
    if (file.type !== "video/mp4") {
      setComposerHint("仅支持 MP4 视频文件。", "error");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setComposerHint("视频不能超过 100MB。", "error");
      return;
    }
    clearPendingAttachment();
    state.pendingVideo = file;
    state.pendingVideoUrl = URL.createObjectURL(file);
    elements.composerAttachmentPreviewVideo.src = state.pendingVideoUrl;
    elements.composerAttachmentPreviewVideo.hidden = false;
    elements.composerAttachmentPreview.hidden = true;
    elements.composerAttachment.hidden = false;
    elements.composerAttachment.focus();
    setComposerHint("按下 Enter 发送视频");
  }

  function clearPendingAttachment() {
    if (state.pendingImageUrl) {
      URL.revokeObjectURL(state.pendingImageUrl);
    }
    if (state.pendingVideoUrl) {
      URL.revokeObjectURL(state.pendingVideoUrl);
    }
    state.pendingImage = null;
    state.pendingImageUrl = null;
    state.pendingVideo = null;
    state.pendingVideoUrl = null;
    elements.composerAttachment.hidden = true;
    elements.composerAttachmentPreview.src = "";
    elements.composerAttachmentPreview.hidden = false;
    elements.composerAttachmentPreviewVideo.src = "";
    elements.composerAttachmentPreviewVideo.hidden = true;
    if (elements.imageInput.value) {
      elements.imageInput.value = "";
    }
    if (elements.videoInput.value) {
      elements.videoInput.value = "";
    }
  }

  async function handleSendError(response, fallbackMessage) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 409) {
      setComposerHint(error.msg || "消息已发出，但本地同步失败，稍后会自动补全。", "error");
    } else {
      setComposerHint(error.msg || fallbackMessage, "error");
    }
  }

  async function sendImage() {
    if (state.sending || !state.currentGid || !state.pendingImage) return;
    state.sending = true;
    elements.composer.disabled = true;
    elements.imagePickerOpen.disabled = true;
    elements.videoPickerOpen.disabled = true;
    setComposerHint("发送中…", "sending");
    try {
      const formData = new FormData();
      formData.append("gid", String(state.currentGid));
      formData.append("file", state.pendingImage);
      const response = await fetch("/chat/messages/sendImage", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        await handleSendError(response, "图片发送失败，请稍后重试。");
        return;
      }
      clearPendingAttachment();
      state.followingLatest = true;
      await refreshMessages();
      setComposerHint("按下 Enter 发送内容 / Shift+Enter 换行");
    } catch {
      setComposerHint("图片发送失败，请稍后重试。", "error");
    } finally {
      state.sending = false;
      elements.composer.disabled = false;
      elements.imagePickerOpen.disabled = !state.currentGid;
      elements.videoPickerOpen.disabled = !state.currentGid;
      elements.composer.focus();
    }
  }

  async function sendVideo() {
    if (state.sending || !state.currentGid || !state.pendingVideo) return;
    state.sending = true;
    elements.composer.disabled = true;
    elements.imagePickerOpen.disabled = true;
    elements.videoPickerOpen.disabled = true;
    setComposerHint("发送中…", "sending");
    try {
      const formData = new FormData();
      formData.append("gid", String(state.currentGid));
      formData.append("file", state.pendingVideo);
      const response = await fetch("/chat/messages/sendVideo", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        await handleSendError(response, "视频发送失败，请稍后重试。");
        return;
      }
      clearPendingAttachment();
      state.followingLatest = true;
      await refreshMessages();
      setComposerHint("按下 Enter 发送内容 / Shift+Enter 换行");
    } catch {
      setComposerHint("视频发送失败，请稍后重试。", "error");
    } finally {
      state.sending = false;
      elements.composer.disabled = false;
      elements.imagePickerOpen.disabled = !state.currentGid;
      elements.videoPickerOpen.disabled = !state.currentGid;
      elements.composer.focus();
    }
  }

  async function sendMessage() {
    if (state.sending || !state.currentGid) return;
    if (state.pendingImage) {
      await sendImage();
      return;
    }
    if (state.pendingVideo) {
      await sendVideo();
      return;
    }
    const content = elements.composer.value.trim();
    if (!content) return;
    state.sending = true;
    elements.composer.disabled = true;
    setComposerHint("发送中…", "sending");
    try {
      const response = await fetch("/chat/messages/send", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({gid: String(state.currentGid), content})
      });
      if (!response.ok) {
        await handleSendError(response, "消息发送失败，请稍后重试。");
        return;
      }
      elements.composer.value = "";
      state.followingLatest = true;
      await refreshMessages();
      setComposerHint("按下 Enter 发送内容 / Shift+Enter 换行");
    } catch {
      setComposerHint("消息发送失败，请稍后重试。", "error");
    } finally {
      state.sending = false;
      elements.composer.disabled = false;
      elements.composer.focus();
    }
  }

  async function initialize() {
    elements.retryGroups.hidden = true;
    elements.groupsState.textContent = "";
    try {
      state.groups = await fetchJson("/chat/groups", {cache: "no-store"});
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
  elements.loginQr.addEventListener("click", startQrLogin);
  elements.composer.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  elements.composerAttachment.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  elements.composer.addEventListener("input", () => {
    if (elements.composerHint.textContent !== "发送中…") {
      setComposerHint("按下 Enter 发送内容 / Shift+Enter 换行");
    }
  });
  const handlePaste = event => {
    if (!state.currentGid) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        event.preventDefault();
        setPendingImage(item.getAsFile());
        return;
      }
      if (item.kind === "file" && item.type.startsWith("video/")) {
        event.preventDefault();
        setPendingVideo(item.getAsFile());
        return;
      }
    }
  };
  elements.composer.addEventListener("paste", handlePaste);
  elements.composerAttachment.addEventListener("paste", handlePaste);
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
  elements.emojiPickerOpen.addEventListener("click", () => toggleEmojiPanel());
  elements.imagePickerOpen.addEventListener("click", () => elements.imageInput.click());
  elements.imageInput.addEventListener("change", () => {
    if (elements.imageInput.files?.[0]) {
      setPendingImage(elements.imageInput.files[0]);
    }
  });
  elements.videoPickerOpen.addEventListener("click", () => elements.videoInput.click());
  elements.videoInput.addEventListener("change", () => {
    if (elements.videoInput.files?.[0]) {
      setPendingVideo(elements.videoInput.files[0]);
    }
  });
  elements.composerAttachmentRemove.addEventListener("click", clearPendingAttachment);
  elements.emojiPanelGrid.addEventListener("click", event => {
    const cell = event.target.closest(".emoji-cell");
    if (cell) insertEmoji(cell.alt);
  });
  document.addEventListener("click", event => {
    if (elements.emojiPanel.hidden) return;
    if (elements.emojiPanel.contains(event.target)) return;
    if (elements.emojiPickerOpen.contains(event.target)) return;
    toggleEmojiPanel(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.emojiPanel.hidden) {
      toggleEmojiPanel(false);
    }
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
  elements.historySync.addEventListener("click", captureHistory);
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
  setInterval(refreshView, 1_000);

  // 监听消息子树变化（renderMessages 重建 DOM 等）跟随到底部
  // 图片异步加载撑开由 messageMedia 的 load 回调（stickToBottom）处理
  // ResizeObserver 监听固定高度 overflow 容器不会因 children 撑开触发，故改用 MutationObserver
  new MutationObserver(() => scrollToBottom())
    .observe(elements.messages, {childList: true, subtree: true});

  elements.windowToggle.addEventListener("click", () => { location.href = "/post/"; });

  initialize();
  checkLoginStatus();
})();
