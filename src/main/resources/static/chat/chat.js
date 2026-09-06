(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const EARLIER_LOAD_THRESHOLD = 120;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const IMMERSIVE_KEY = "weibo-chat:immersive";
  const MESSAGE_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%\[\]-]+/g;
  const EMOJI_PHRASE_PATTERN = /\[[^\[\]]+\]/g;
  const EMOJI_IMAGE_TEST = /\[(\/[0-9a-z]+\.png)\]/i;
  const EMOJI_IMAGE_BASE = "https://img.t.sinajs.cn/t4/appstyle/expression/emimage";
  const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};
  const SYSTEM_SENDER_NAME = "粉丝群";
  const RED_PACKET_TEXT = "收到红包消息";
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
    newMessages: document.querySelector("#new-messages"),
    followIndicator: document.querySelector("#follow-indicator"),
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
    loginQrImg: document.querySelector("#login-qr-img"),
    qrLoading: document.querySelector("#qr-loading"),
    analysisOpen: document.querySelector("#analysis-open"),
    analysisDialog: document.querySelector("#analysis-dialog"),
    analysisClose: document.querySelector("#analysis-close"),
    analysisTitle: document.querySelector("#analysis-title"),
    analysisForm: document.querySelector("#analysis-form"),
    analysisDate: document.querySelector("#analysis-date"),
    analysisPrompt: document.querySelector("#analysis-prompt"),
    analysisSubmit: document.querySelector("#analysis-submit"),
    analysisFeedback: document.querySelector("#analysis-feedback"),
    analysisEmpty: document.querySelector("#analysis-empty"),
    analysisResults: document.querySelector("#analysis-results"),
    analysisList: document.querySelector("#analysis-list"),
    analysisPrev: document.querySelector("#analysis-prev"),
    analysisNext: document.querySelector("#analysis-next"),
    analysisPageState: document.querySelector("#analysis-page-state"),
    analysisDetail: document.querySelector("#analysis-detail"),
    analysisBack: document.querySelector("#analysis-back"),
    analysisDownload: document.querySelector("#analysis-download"),
    analysisDetailContent: document.querySelector("#analysis-detail-content"),
    analysisDetailMeta: document.querySelector("#analysis-detail-meta"),
    conversation: document.querySelector(".conversation"),
    immersiveToggle: document.querySelector("#immersive-toggle"),
    windowToggle: document.querySelector(".window-control.toggle"),
    celebrationStage: document.querySelector("#celebration-stage"),
    celebrationRoster: document.querySelector("#celebration-roster"),
    celebrationPopover: document.querySelector("#celebration-popover"),
    celebrationPopoverTitle: document.querySelector("#celebration-popover-title"),
    celebrationPopoverClose: document.querySelector("#celebration-popover-close"),
    celebrationPopoverRemove: document.querySelector("#celebration-popover-remove"),
    celebrationInterval: document.querySelector("#celebration-interval"),
    celebrationPopoverJoin: document.querySelector("#celebration-popover-join")
  };
  // followingLatest 用存取器驱动跟随状态图标，所有赋值点自动同步视图
  let followingLatest = true;
  const state = {
    groups: [],
    currentGid: null,
    messages: new Map(),
    beforeCursor: null,
    hasMore: false,
    refreshingGroups: false,
    refreshing: false,
    initializing: false,
    loadingEarlier: false,
    pendingCatchUp: false,
    get followingLatest() {
      return followingLatest;
    },
    set followingLatest(value) {
      followingLatest = value;
      updateFollowIndicator();
    },
    sending: false,
    pendingAttachment: null,
    lastSizeGid: null,
    lastMessageCount: null,
    loginCheckTick: 0,
    loginPending: false
  };
  const analysisState = {
    gid: null,
    page: 1,
    total: 0,
    size: 20,
    requestVersion: 0,
    loading: false
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

  function messageElement(message, targetMid, onMediaLoad = null, gid = null) {
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
    if (message.senderName?.trim() === SYSTEM_SENDER_NAME) {
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
    if (gid) {
      // 名字可点击配置回归庆祝；历史浏览等无 gid 场景保持纯文本
      const sender = document.createElement("button");
      sender.type = "button";
      sender.className = "message-sender";
      sender.textContent = message.senderName || "未知成员";
      sender.title = "设置回归庆祝";
      sender.addEventListener("click", () => openCelebrationPopover(
        gid, message.senderId, message.senderName, message.senderAvatar, sender));
      meta.append(sender, document.createTextNode(` · ${formatTime(message.createdAt)}`));
    } else {
      meta.textContent = `${message.senderName || "未知成员"} · ${formatTime(message.createdAt)}`;
    }
    const media = messageMedia(message, onMediaLoad);
    const hidesBubbleText = media
      && ["分享图片", "分享视频", "[动画表情]"].includes(message.text?.trim());
    content.append(meta);
    if (!hidesBubbleText) content.append(bubble);
    if (media) content.append(media);
    article.append(content);
    return article;
  }

  function renderMessages(forceFollow = false) {
    const ordered = [...state.messages.values()].sort(compareMessages);
    const onLoad = forceFollow ? () => scrollToBottom(true) : () => scrollToBottom();

    // 已渲染的消息元素按 mid 索引
    const existingByMid = new Map();
    for (const el of elements.messages.children) {
      if (el.dataset.mid) existingByMid.set(Number(el.dataset.mid), el);
    }
    const desiredMids = new Set(ordered.map(message => message.mid));

    // 无交集时直接全量重建（切换群聊、首次加载）
    const hasCommon = ordered.some(message => existingByMid.has(message.mid));
    if (!hasCommon) {
      elements.messages.replaceChildren(...ordered.map(message => messageElement(
        message, null, onLoad, state.currentGid)));
      return;
    }

    // 移除不再存在的消息
    for (const [mid, el] of existingByMid) {
      if (!desiredMids.has(mid)) el.remove();
    }

    // 按顺序插入新消息、校正位置
    let prevEl = null;
    for (const message of ordered) {
      let el = existingByMid.get(message.mid);
      if (el) {
        const expectedNext = prevEl ? prevEl.nextElementSibling
          : elements.messages.firstElementChild;
        if (el !== expectedNext) {
          if (prevEl) prevEl.after(el);
          else elements.messages.prepend(el);
        }
      } else {
        el = messageElement(message, null, onLoad, state.currentGid);
        if (prevEl) prevEl.after(el);
        else elements.messages.prepend(el);
      }
      prevEl = el;
    }
  }

  function messageMedia(message, onLoad) {
    if (!message.previewUrl) return null;
    const button = document.createElement("button");
    button.type = "button";
    const image = document.createElement("img");
    // 首页/刷新的图片需要立即加载以触发 scrollToBottom，懒加载会让 load 回调无法及时跟随到底部
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
          // 自动播放被浏览器阻止时静默处理，controls 已开启供用户手动播放
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

  const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  function formatTime(timestamp) {
    return timeFormatter.format(new Date(timestamp));
  }

  function formatDateTime(timestamp) {
    return dateTimeFormatter.format(new Date(timestamp));
  }

  function isVideoMessage(message) {
    if (message.videoUrl) return true;
    if (message.mediaType === MEDIA_TYPE.VIDEO) return true;
    return message.mediaType === MEDIA_TYPE.VIDEO_OR_REDPACKET
      && !(message.text || "").includes(RED_PACKET_TEXT);
  }

  function historySummary(message) {
    if (isVideoMessage(message)) return "[视频]";
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
    state.beforeCursor = null;
    state.hasMore = false;
    state.pendingCatchUp = false;
    elements.newMessages.hidden = true;
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    updateCurrentGroupHeader();
    elements.currentId.textContent = String(group.gid);
    renderCelebrationRoster();
    elements.historyOpen.disabled = false;
    elements.analysisOpen.disabled = false;
    elements.emojiPickerOpen.disabled = false;
    elements.imagePickerOpen.disabled = false;
    elements.videoPickerOpen.disabled = false;
    elements.historyTitle.textContent = `聊天记录 - ${group.name || `群聊 ${group.gid}`}`;
    elements.analysisTitle.textContent = `群聊分析 - ${group.name || `群聊 ${group.gid}`}`;
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
      let countEl = elements.currentSize.querySelector(".current-message-count");
      if (!countEl) {
        countEl = document.createElement("span");
        countEl.className = "current-message-count";
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

  async function loadMessages(beforeCursor = null) {
    const isLatestPage = beforeCursor === null;
    const anchor = isLatestPage ? null : captureScrollAnchor();
    const gid = state.currentGid;
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    if (!isLatestPage) {
      query.set("beforeCreatedAt", String(beforeCursor.createdAt));
      query.set("beforeMid", String(beforeCursor.mid));
    }
    try {
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid) return;
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.beforeCursor = result.hasMore && result.nextBeforeCreatedAt !== null
        && result.nextBeforeMid !== null
        ? {createdAt: result.nextBeforeCreatedAt, mid: result.nextBeforeMid}
        : null;
      state.hasMore = result.hasMore;
      if (isLatestPage) {
        state.followingLatest = true;
        renderMessages(isLatestPage);
        scrollToBottom(true);
        // 首屏只悄悄建立基线，不触发庆祝（全新打开不追溯过去的回归）
        seedCelebrationSeen(gid, result.items);
      } else {
        renderMessages();
        restoreScrollAnchor(anchor);
        // 向上翻页加载的旧消息同样算亲眼见证，垫高基线（只增不减）
        seedCelebrationSeen(gid, result.items);
      }
    } catch (error) {
      console.warn("加载消息失败：", error);
    }
  }

  function scrollToBottom(force = false) {
    if (force || state.followingLatest) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  }

  function updateFollowIndicator() {
    const following = state.followingLatest;
    elements.followIndicator.classList.toggle("paused", !following);
    elements.followIndicator.setAttribute("aria-label", following
      ? "正在跟随最新消息"
      : "已暂停跟随最新消息，新消息不会自动滚动");
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
    if (!state.beforeCursor) return;
    state.loadingEarlier = true;
    try {
      await loadMessages(state.beforeCursor);
    } finally {
      state.loadingEarlier = false;
    }
  }

  async function refreshMessages() {
    if (!state.currentGid || state.initializing || state.refreshing || document.hidden) return;
    state.refreshing = true;
    const gid = state.currentGid;
    try {
      if (state.pendingCatchUp && state.messages.size > 0) {
        // 回到页面后追平离开期间的缺口，追平会一直翻到最新，不再走常规刷新
        if (await catchUpMessages(gid)) state.pendingCatchUp = false;
        return;
      }
      // 标签页隐藏期间视为未在阅读，回来后不自动贴底，保留上次阅读位置
      const followedLatest = state.followingLatest && isNearBottom();
      const knownMids = new Set(state.messages.keys());
      const query = new URLSearchParams({
        gid: String(gid), size: String(PAGE_SIZE)
      });
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid) return;
      const fresh = result.items.filter(message => !knownMids.has(message.mid));
      result.items.forEach(message => state.messages.set(message.mid, message));
      if (fresh.length > 0) {
        state.followingLatest = followedLatest;
        renderMessages();
        if (followedLatest) {
          elements.messages.scrollTop = elements.messages.scrollHeight;
        } else {
          elements.newMessages.hidden = false;
        }
        processCelebrationArrivals(gid, fresh);
      }
    } catch (error) {
      console.warn("刷新消息失败：", error);
    } finally {
      state.refreshing = false;
      if (state.currentGid === gid) maybeLoadEarlierMessages();
    }
  }

  // 回到页面后从已加载的最新一条起，用 after 游标逐页向前补拉，直到追平最新
  async function catchUpMessages(gid) {
    const latest = [...state.messages.values()].reduce((left, right) =>
      compareMessages(left, right) >= 0 ? left : right);
    let cursor = {createdAt: latest.createdAt, mid: latest.mid};
    let added = false;
    while (!document.hidden && state.currentGid === gid) {
      const query = new URLSearchParams({
        gid: String(gid), size: String(PAGE_SIZE),
        afterCreatedAt: String(cursor.createdAt), afterMid: String(cursor.mid)
      });
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid) return false;
      result.items.forEach(message => state.messages.set(message.mid, message));
      if (result.items.length > 0) {
        added = true;
        renderMessages();
        // 追平的缺口同样算亲眼见证，符合条件的回归照常庆祝
        processCelebrationArrivals(gid, result.items);
      }
      if (!result.hasMore || result.nextAfterCreatedAt === null
        || result.nextAfterMid === null) break;
      cursor = {createdAt: result.nextAfterCreatedAt, mid: result.nextAfterMid};
    }
    // 追平后不自动贴底，由“新消息”按钮提示，点击恢复跟随
    if (added && !state.followingLatest) elements.newMessages.hidden = false;
    return !document.hidden && state.currentGid === gid;
  }

  function groupsEqual(prev, next) {
    if (prev.length !== next.length) return false;
    return prev.every((group, i) => {
      const other = next[i];
      return group.gid === other.gid
        && group.name === other.name
        && group.avatar === other.avatar
        && group.latestMessage === other.latestMessage
        && group.latestSenderName === other.latestSenderName
        && group.messageCount === other.messageCount
        && group.memberCount === other.memberCount
        && group.maxMember === other.maxMember
        && sameAdmins(group.admins, other.admins);
    });
  }

  function sameAdmins(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  async function refreshGroups() {
    if (state.refreshingGroups || document.hidden) return;
    state.refreshingGroups = true;
    try {
      const groups = await fetchJson("/chat/groups", {cache: "no-store"});
      if (groupsEqual(state.groups, groups)) return;
      state.groups = groups;
      renderGroups();
      updateCurrentGroupHeader();
    } catch (error) {
      console.warn("刷新群聊列表失败：", error);
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
  const QR_IMAGE_INTERVAL = 10000;

  let qrImageTimer = null;

  function refreshQrImage() {
    const img = new Image();
    img.onload = () => {
      elements.qrLoading.hidden = true;
      elements.loginQrImg.src = img.src;
      elements.loginQrImg.hidden = false;
    };
    img.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }

  function startQrImagePolling() {
    elements.loginQrImg.hidden = true;
    elements.qrLoading.hidden = false;
    qrImageTimer = setInterval(refreshQrImage, QR_IMAGE_INTERVAL);
    setTimeout(refreshQrImage, 3000);
  }

  function stopQrImagePolling() {
    if (qrImageTimer) {
      clearInterval(qrImageTimer);
      qrImageTimer = null;
    }
    elements.loginQrImg.hidden = true;
    elements.qrLoading.hidden = true;
  }

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
    } catch (error) {
      console.warn("检查登录状态失败：", error);
    }
  }

  async function startQrLogin() {
    if (state.loginPending) return;
    state.loginPending = true;
    elements.loginQr.disabled = true;
    elements.loginQr.textContent = QR_LOGIN_LOADING_TEXT;
    startQrImagePolling();
    try {
      const response = await fetch("/weibo/login/qr", {method: "POST"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      elements.loginExpired.hidden = true;
      await initialize();
    } catch {
      elements.groupsState.textContent = "扫码登录失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    } finally {
      stopQrImagePolling();
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

  function setPendingAttachment(kind, file) {
    if (!file) return;
    const isImage = kind === "image";
    const validType = isImage ? file.type.startsWith("image/") : file.type === "video/mp4";
    if (!validType) {
      setComposerHint(isImage ? "仅支持图片文件。" : "仅支持 MP4 视频文件。", "error");
      return;
    }
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      setComposerHint(isImage ? "图片不能超过 20MB。" : "视频不能超过 100MB。", "error");
      return;
    }
    clearPendingAttachment();
    state.pendingAttachment = {kind, file, url: URL.createObjectURL(file)};
    elements.composerAttachmentPreview.src = isImage ? state.pendingAttachment.url : "";
    elements.composerAttachmentPreview.hidden = !isImage;
    elements.composerAttachmentPreviewVideo.src = isImage ? "" : state.pendingAttachment.url;
    elements.composerAttachmentPreviewVideo.hidden = isImage;
    elements.composerAttachment.hidden = false;
    elements.composerAttachment.focus();
    setComposerHint(isImage ? "按下 Enter 发送图片" : "按下 Enter 发送视频");
  }

  function clearPendingAttachment() {
    if (state.pendingAttachment) {
      URL.revokeObjectURL(state.pendingAttachment.url);
    }
    state.pendingAttachment = null;
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

  async function sendAttachment() {
    if (state.sending || !state.currentGid || !state.pendingAttachment) return;
    const kind = state.pendingAttachment.kind;
    const endpoint = kind === "image" ? "/chat/messages/sendImage" : "/chat/messages/sendVideo";
    state.sending = true;
    elements.composer.disabled = true;
    elements.imagePickerOpen.disabled = true;
    elements.videoPickerOpen.disabled = true;
    setComposerHint("发送中…", "sending");
    try {
      const formData = new FormData();
      formData.append("gid", String(state.currentGid));
      formData.append("file", state.pendingAttachment.file);
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        await handleSendError(response,
          kind === "image" ? "图片发送失败，请稍后重试。" : "视频发送失败，请稍后重试。");
        return;
      }
      clearPendingAttachment();
      state.followingLatest = true;
      await refreshMessages();
      setComposerHint("按下 Enter 发送内容 / Shift+Enter 换行");
    } catch {
      setComposerHint(kind === "image" ? "图片发送失败，请稍后重试。" : "视频发送失败，请稍后重试。",
        "error");
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
    if (state.pendingAttachment) {
      await sendAttachment();
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
    state.initializing = true;
    elements.retryGroups.hidden = true;
    elements.groupsState.textContent = "";
    try {
      state.groups = await fetchJson("/chat/groups", {cache: "no-store"});
      renderGroups();
      if (!state.groups.length) {
        elements.groupsState.textContent = "";
        elements.groupsCount.textContent = "暂无群聊";
        elements.groupsList.replaceChildren(
          Object.assign(document.createElement("div"), {
            className: "groups-empty",
            textContent: "暂无群聊数据",
          }),
        );
        return;
      }
      const savedGid = Number(localStorage.getItem(LAST_GROUP_KEY));
      const initial = state.groups.find(group => group.gid === savedGid) || state.groups[0];
      await selectGroup(initial.gid);
    } catch {
      elements.groupsCount.textContent = "加载失败";
      elements.groupsState.textContent = "群聊列表加载失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    } finally {
      state.initializing = false;
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
        setPendingAttachment("image", item.getAsFile());
        return;
      }
      if (item.kind === "file" && item.type.startsWith("video/")) {
        event.preventDefault();
        setPendingAttachment("video", item.getAsFile());
        return;
      }
    }
  };
  elements.composer.addEventListener("paste", handlePaste);
  elements.composerAttachment.addEventListener("paste", handlePaste);
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

  /* ---------- 群聊分析 ---------- */

  const ANALYSIS_DEFAULT_PROMPT = "请总结今天群聊的主要讨论话题和参与者";

  function resetAnalysis(gid) {
    analysisState.requestVersion++;
    analysisState.gid = gid;
    analysisState.page = 1;
    analysisState.total = 0;
    elements.analysisDate.value = localDateValue(new Date());
    elements.analysisPrompt.value = ANALYSIS_DEFAULT_PROMPT;
    elements.analysisList.replaceChildren();
    elements.analysisPageState.textContent = "";
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = true;
    elements.analysisEmpty.hidden = false;
    elements.analysisEmpty.textContent = "设置分析条件后点击分析";
    elements.analysisFeedback.textContent = "";
    elements.analysisSubmit.disabled = false;
    elements.analysisSubmit.textContent = "🤖 分析";
  }

  async function queryAnalysisList(page) {
    const requestVersion = ++analysisState.requestVersion;
    const gid = analysisState.gid;
    elements.analysisEmpty.hidden = true;
    elements.analysisDetail.hidden = true;
    const params = new URLSearchParams({
      gid: String(gid),
      page: String(page),
      size: String(analysisState.size)
    });
    try {
      const result = await fetchJson(`/chat/analyses?${params}`, {cache: "no-store"});
      if (requestVersion !== analysisState.requestVersion) return;
      analysisState.page = result.page;
      analysisState.total = result.total;
      renderAnalysisResults(result.items);
      elements.analysisFeedback.textContent = result.items.length ? "" : "暂无历史分析记录。";
    } catch {
      if (requestVersion !== analysisState.requestVersion) return;
      elements.analysisResults.hidden = true;
      elements.analysisFeedback.textContent = "查询历史分析失败，请稍后重试。";
    }
  }

  function renderAnalysisResults(items) {
    elements.analysisList.replaceChildren(...items.map(item => {
      const row = document.createElement("button");
      row.className = "analysis-item";
      row.type = "button";
      const date = document.createElement("span");
      date.className = "analysis-item-date";
      date.textContent = item.date;
      const prompt = document.createElement("span");
      prompt.className = "analysis-item-prompt";
      prompt.textContent = item.promptPreview || "";
      if (item.promptPreview) {
        prompt.title = item.promptPreview;
      }
      const count = document.createElement("span");
      count.className = "analysis-item-count";
      count.textContent = `${item.messageCount} 条`;
      const time = document.createElement("span");
      time.className = "analysis-item-time";
      time.textContent = item.createdAt;
      row.append(date, prompt, count, time);
      row.addEventListener("click", () => loadAnalysisDetail(item.id));
      return row;
    }));
    const pageCount = Math.max(1, Math.ceil(analysisState.total / analysisState.size));
    elements.analysisPageState.textContent =
      `第 ${analysisState.page} / ${pageCount} 页，共 ${analysisState.total} 条`;
    elements.analysisPrev.disabled = analysisState.page <= 1;
    elements.analysisNext.disabled = analysisState.page >= pageCount;
    elements.analysisEmpty.hidden = true;
    elements.analysisDetail.hidden = true;
    elements.analysisResults.hidden = false;
    elements.analysisList.scrollTop = 0;
  }

  function renderAnalysisMeta(view) {
    const meta = elements.analysisDetailMeta;
    meta.replaceChildren();
    const fields = [
      {label: "分析日期", value: view.date},
      {label: "分析条数", value: view.messageCount != null ? `${view.messageCount} 条` : ""},
      {label: "分析时间", value: view.createdAt}
    ];
    for (const field of fields) {
      if (!field.value) continue;
      const item = document.createElement("span");
      item.className = "analysis-meta-field";
      const label = document.createElement("span");
      label.className = "analysis-meta-label";
      label.textContent = `${field.label}：`;
      const value = document.createElement("span");
      value.className = "analysis-meta-value";
      value.textContent = field.value;
      item.append(label, value);
      meta.append(item);
    }
    if (view.prompt) {
      const item = document.createElement("span");
      item.className = "analysis-meta-field analysis-meta-prompt";
      const label = document.createElement("span");
      label.className = "analysis-meta-label";
      label.textContent = "提示词：";
      const value = document.createElement("span");
      value.className = "analysis-meta-value";
      value.textContent = view.prompt;
      value.title = view.prompt;
      const copyBtn = document.createElement("button");
      copyBtn.className = "analysis-meta-copy";
      copyBtn.type = "button";
      copyBtn.textContent = "📋";
      copyBtn.title = "复制提示词";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(view.prompt);
          copyBtn.textContent = "✅";
          setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
        } catch {
          copyBtn.textContent = "❌";
          setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
        }
      });
      item.append(label, value, copyBtn);
      meta.append(item);
    }
    meta.hidden = meta.children.length === 0;
  }

  let currentAnalysisView = null;

  function renderMarkdown(text) {
    const html = window.marked ? window.marked.parse(text) : text;
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  }

  async function loadAnalysisDetail(id) {
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = false;
    elements.analysisFeedback.textContent = "";
    elements.analysisDetailMeta.hidden = true;
    elements.analysisDownload.disabled = true;
    elements.analysisDetailContent.innerHTML = '<div class="analysis-pending">正在加载…</div>';
    try {
      const result = await fetchJson(`/chat/analyses/${id}`, {cache: "no-store"});
      currentAnalysisView = result;
      renderAnalysisMeta(result);
      elements.analysisDownload.disabled = false;
      elements.analysisDetailContent.innerHTML = renderMarkdown(result.result);
      elements.analysisDetailContent.scrollTop = 0;
    } catch {
      elements.analysisFeedback.textContent = "加载分析详情失败。";
    }
  }

  function parseSseEvent(block) {
    let event = "message";
    const dataLines = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    return dataLines.length ? {event, data: dataLines.join("\n")} : null;
  }

  async function submitAnalysis() {
    elements.analysisSubmit.disabled = true;
    elements.analysisSubmit.textContent = "分析中…";
    elements.analysisEmpty.hidden = true;
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = false;
    elements.analysisDetailMeta.hidden = true;
    elements.analysisDetailContent.innerHTML = '<div class="analysis-pending">正在分析，请稍候…</div>';
    elements.analysisFeedback.textContent = "";
    let streamed = "";
    let renderScheduled = false;
    const renderStream = () => {
      elements.analysisDetailContent.innerHTML = renderMarkdown(streamed);
      elements.analysisDetailContent.scrollTop = elements.analysisDetailContent.scrollHeight;
    };
    const scheduleRender = () => {
      if (renderScheduled) return;
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        renderStream();
      });
    };
    try {
      const params = new URLSearchParams({
        gid: String(analysisState.gid),
        date: elements.analysisDate.value,
        prompt: elements.analysisPrompt.value
      });
      const response = await fetch("/chat/analyses/stream", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: params
      });
      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.msg || `HTTP ${response.status}`);
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let doneView = null;
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        buffer += value;
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop();
        for (const block of blocks) {
          const parsed = parseSseEvent(block);
          if (!parsed) continue;
          if (parsed.event === "delta") {
            streamed += parsed.data;
            scheduleRender();
          } else if (parsed.event === "done") {
            doneView = JSON.parse(parsed.data);
          } else if (parsed.event === "error") {
            throw new Error(parsed.data);
          }
        }
      }
      elements.analysisFeedback.textContent = "分析完成。";
      await queryAnalysisList(1);
      if (doneView) {
        loadAnalysisDetail(doneView.id);
      } else {
        elements.analysisResults.hidden = true;
        elements.analysisDetail.hidden = false;
        renderStream();
      }
    } catch (error) {
      elements.analysisDetail.hidden = true;
      elements.analysisResults.hidden = false;
      elements.analysisFeedback.textContent = `分析失败：${error.message}`;
    } finally {
      elements.analysisSubmit.disabled = false;
      elements.analysisSubmit.textContent = "🤖 分析";
    }
  }

  elements.analysisOpen.addEventListener("click", () => {
    resetAnalysis(state.currentGid);
    elements.analysisDialog.showModal();
    queryAnalysisList(1);
  });
  elements.analysisClose.addEventListener("click", () => elements.analysisDialog.close());
  elements.analysisForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAnalysis();
  });
  elements.analysisPrev.addEventListener("click", () => queryAnalysisList(analysisState.page - 1));
  elements.analysisNext.addEventListener("click", () => queryAnalysisList(analysisState.page + 1));
  elements.analysisBack.addEventListener("click", () => {
    analysisState.requestVersion += 1;
    currentAnalysisView = null;
    elements.analysisDownload.disabled = true;
    elements.analysisDetail.hidden = true;
    elements.analysisFeedback.textContent = "";
    elements.analysisResults.hidden = false;
  });
  elements.analysisDownload.addEventListener("click", () => {
    if (!currentAnalysisView) return;
    const header = `# 群聊分析报告\n\n- 分析日期：${currentAnalysisView.date}\n- 分析条数：${currentAnalysisView.messageCount} 条\n- 分析时间：${currentAnalysisView.createdAt}\n- 提示词：${currentAnalysisView.prompt}\n\n---\n\n`;
    const blob = new Blob([header + currentAnalysisView.result], {type: "text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `群聊分析_${currentAnalysisView.createdAt.replace(/[: ]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });
  elements.emojiPickerOpen.addEventListener("click", () => toggleEmojiPanel());
  elements.imagePickerOpen.addEventListener("click", () => elements.imageInput.click());
  elements.imageInput.addEventListener("change", () => {
    if (elements.imageInput.files?.[0]) {
      setPendingAttachment("image", elements.imageInput.files[0]);
    }
  });
  elements.videoPickerOpen.addEventListener("click", () => elements.videoInput.click());
  elements.videoInput.addEventListener("change", () => {
    if (elements.videoInput.files?.[0]) {
      setPendingAttachment("video", elements.videoInput.files[0]);
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
    if (document.hidden) {
      // 离开当前标签页，挂起跟随最新并标记待追平，回来后补齐缺口
      state.followingLatest = false;
      state.pendingCatchUp = true;
      return;
    }
    refreshView();
  });
  setInterval(refreshView, 3_000);

  // 监听消息子树变化（renderMessages 重建 DOM 等）跟随到底部
  // 图片异步加载撑开由 messageMedia 的 load 回调（stickToBottom）处理
  // ResizeObserver 监听固定高度 overflow 容器不会因 children 撑开触发，故改用 MutationObserver
  // rAF 防抖：同一帧内多次子树变更只触发一次 scrollToBottom
  let scrollScheduled = false;
  new MutationObserver(() => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      scrollToBottom();
    });
  }).observe(elements.messages, {childList: true, subtree: true});

  elements.windowToggle.addEventListener("click", () => { location.href = "/post/index.html"; });

  // 沉浸阅读：收起群简介栏与输入区，状态持久化，刷新后保持
  function applyImmersive(enabled) {
    elements.conversation.classList.toggle("immersive", enabled);
    elements.immersiveToggle.setAttribute("aria-pressed", String(enabled));
    const label = enabled ? "退出沉浸阅读" : "进入沉浸阅读";
    elements.immersiveToggle.setAttribute("aria-label", label);
    elements.immersiveToggle.setAttribute("title", label);
  }

  elements.immersiveToggle.addEventListener("click", () => {
    const enabled = !elements.conversation.classList.contains("immersive");
    localStorage.setItem(IMMERSIVE_KEY, enabled ? "1" : "0");
    applyImmersive(enabled);
  });

  applyImmersive(localStorage.getItem(IMMERSIVE_KEY) === "1");

  /* ---------- 回归庆祝 ---------- */

  const CELEBRATION_ROSTER_KEY = "weibo-chat:celebration-roster";
  const CELEBRATION_SEEN_KEY = "weibo-chat:celebration-seen";
  // 回归间隔默认值，单位秒
  const CELEBRATION_DEFAULT_INTERVAL = 30;

  function loadCelebrationStore(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  // roster：按群按成员存 { name, avatar, interval }；seen：按「群:成员」存最后见到的发言时间
  const celebrationRoster = loadCelebrationStore(CELEBRATION_ROSTER_KEY);
  const celebrationSeen = loadCelebrationStore(CELEBRATION_SEEN_KEY);
  let celebrationDraft = null;

  function celebrationEntry(gid, senderId) {
    return celebrationRoster[String(gid)]?.[String(senderId)] || null;
  }

  function saveCelebrationRoster() {
    localStorage.setItem(CELEBRATION_ROSTER_KEY, JSON.stringify(celebrationRoster));
  }

  function saveCelebrationSeen() {
    localStorage.setItem(CELEBRATION_SEEN_KEY, JSON.stringify(celebrationSeen));
  }

  // 用当前加载到的消息悄悄垫高基线：刚加入名单的活跃成员不会立刻触发庆祝
  function seedCelebrationSeen(gid, messages) {
    const roster = celebrationRoster[String(gid)];
    if (!roster) return;
    let changed = false;
    for (const [senderId] of Object.entries(roster)) {
      let latest = 0;
      for (const message of messages) {
        if (String(message.senderId) === senderId && message.createdAt > latest) {
          latest = message.createdAt;
        }
      }
      const key = `${gid}:${senderId}`;
      if (latest > (celebrationSeen[key] || 0)) {
        celebrationSeen[key] = latest;
        changed = true;
      }
    }
    if (changed) saveCelebrationSeen();
  }

  function setCelebrationMember(gid, senderId, data) {
    const roster = celebrationRoster[String(gid)]
      || (celebrationRoster[String(gid)] = {});
    if (data) {
      roster[String(senderId)] = data;
      seedCelebrationSeen(gid, state.messages.values());
    } else {
      delete roster[String(senderId)];
    }
    saveCelebrationRoster();
    renderCelebrationRoster();
  }

  // 新到达消息按时间顺序逐条判定：页面没见过其发言，或沉默满间隔即庆祝
  function processCelebrationArrivals(gid, arrivals) {
    let changed = false;
    for (const message of [...arrivals].sort(compareMessages)) {
      const entry = celebrationEntry(gid, message.senderId);
      if (!entry) continue;
      const key = `${gid}:${message.senderId}`;
      const baseline = celebrationSeen[key] || 0;
      const interval = entry.interval > 0 ? entry.interval : CELEBRATION_DEFAULT_INTERVAL;
      if (message.createdAt <= baseline) continue;
      if (!baseline || message.createdAt - baseline >= interval * 1000) {
        spawnCelebration(entry);
      }
      celebrationSeen[key] = message.createdAt;
      changed = true;
    }
    if (changed) saveCelebrationSeen();
  }

  function celebrationAnimLabel(animId) {
    return CELEBRATION_ANIMS.find(anim => anim.id === animId)?.label || "";
  }

  function renderCelebrationRoster() {
    const container = elements.celebrationRoster;
    container.replaceChildren();
    const members = Object.entries(celebrationRoster[String(state.currentGid)] || {});
    container.hidden = members.length === 0;
    for (const [senderId, entry] of members) {
      const chip = document.createElement("span");
      chip.className = "celebration-chip";
      chip.title = `沉默 ${entry.interval} 秒后回归时，怪兽会来戳破泡泡`;
      chip.append(avatar(entry, "celebration-chip-avatar"));
      const name = document.createElement("button");
      name.type = "button";
      name.className = "celebration-chip-name";
      name.textContent = entry.name || "未知成员";
      name.addEventListener("click", () => openCelebrationPopover(
        state.currentGid, senderId, entry.name, entry.avatar, name));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "celebration-chip-remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `将${entry.name || "未知成员"}移出庆祝名单`);
      remove.addEventListener("click", () => {
        setCelebrationMember(state.currentGid, senderId, null);
        if (celebrationDraft?.senderId === senderId
          && celebrationDraft?.gid === state.currentGid) {
          closeCelebrationPopover();
        }
      });
      chip.append(name, remove);
      container.append(chip);
    }
  }

  function commitCelebrationDraft() {
    if (!celebrationDraft) return;
    const text = elements.celebrationInterval.value.trim();
    const raw = Number(text);
    // 间隔最小 1 秒，清空或乱填时回退默认值
    const interval = text !== "" && Number.isFinite(raw)
      ? Math.max(Math.floor(raw), 1)
      : CELEBRATION_DEFAULT_INTERVAL;
    setCelebrationMember(celebrationDraft.gid, celebrationDraft.senderId, {
      name: celebrationDraft.name,
      avatar: celebrationDraft.avatar,
      interval
    });
    elements.celebrationPopoverJoin.hidden = true;
    elements.celebrationPopoverRemove.hidden = false;
  }

  function openCelebrationPopover(gid, senderId, name, avatarUrl, anchor) {
    if (!gid) return;
    const entry = celebrationEntry(gid, senderId);
    celebrationDraft = {
      gid, senderId,
      name: name || "未知成员",
      avatar: avatarUrl || ""
    };
    elements.celebrationPopoverTitle.textContent = "回归庆祝";
    elements.celebrationInterval.value =
      String(entry?.interval > 0 ? entry.interval : CELEBRATION_DEFAULT_INTERVAL);
    elements.celebrationPopoverRemove.hidden = !entry;
    elements.celebrationPopoverJoin.hidden = !!entry;
    elements.celebrationPopover.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const popRect = elements.celebrationPopover.getBoundingClientRect();
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - popRect.width - 8));
    let top = rect.bottom + 6;
    if (top + popRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popRect.height - 6);
    }
    elements.celebrationPopover.style.left = `${left}px`;
    elements.celebrationPopover.style.top = `${top}px`;
  }

  function closeCelebrationPopover() {
    elements.celebrationPopover.hidden = true;
    celebrationDraft = null;
  }

  // 怪兽图集按需加载一次：走路、指泡、雷欧登场（欢呼与骑乘飞离），布局均为 5 列 3 行
  let monsterSheetsPromise = null;
  function loadMonsterSheets() {
    if (!monsterSheetsPromise) {
      monsterSheetsPromise = Promise.all(["walk", "point", "leo"].map(async key => {
        const img = new Image();
        img.src = `/chat/assets/monster/${key}.png`;
        await img.decode();
        return [key, img];
      })).then(entries => Object.fromEntries(entries));
      monsterSheetsPromise.catch(() => { monsterSheetsPromise = null; });
    }
    return monsterSheetsPromise;
  }

  function drawMonsterFrame(canvas, img, frame, flip) {
    const ctx = canvas.getContext("2d");
    const sw = Math.floor(img.width / 5);
    const sh = Math.floor(img.height / 3);
    const f = Math.max(0, Math.min(14, frame));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    const h = canvas.height * 0.96;
    const w = h * sw / sh;
    // 内缩 1 像素采样，避免缩放时吃到相邻帧
    ctx.drawImage(img, (f % 5) * sw + 1, Math.floor(f / 5) * sh + 1, sw - 2, sh - 2,
      (canvas.width - w) / 2, 0, w, h);
  }

  async function spawnCelebration(entry) {
    const stage = elements.celebrationStage;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    // 成员卡片要完整留在舞台内
    if (width < 380 || height < 340) return;
    let sheets;
    try {
      sheets = await loadMonsterSheets();
    } catch {
      return;
    }
    const name = entry.name || "未知成员";

    // 成员卡片：头像被水泡罩住，泡破后头像亮起并显示欢迎面板
    const card = document.createElement("div");
    card.className = "celebration-member";
    const figure = document.createElement("div");
    figure.className = "celebration-member-figure";
    figure.append(avatar(entry, "celebration-member-avatar"));
    const bubble = document.createElement("span");
    bubble.className = "celebration-bubble";
    bubble.setAttribute("aria-hidden", "true");
    figure.append(bubble);
    card.append(figure);

    const wrapper = document.createElement("div");
    wrapper.className = "celebration";
    const actor = document.createElement("button");
    actor.type = "button";
    actor.className = "celebration-actor";
    actor.setAttribute("aria-label", `跳过${name}的回归庆祝`);
    const monster = document.createElement("canvas");
    monster.className = "celebration-monster";
    monster.width = 440;
    monster.height = 440;
    actor.append(monster);
    // 台词是怪兽的话：悬在怪兽头顶，戳破前「你终于冒泡了」，戳破后当场改口
    const speech = document.createElement("span");
    speech.className = "celebration-speech";
    speech.textContent = "你终于冒泡了";
    actor.append(speech);
    wrapper.append(actor);
    stage.append(card, wrapper);

    // 卡片停在中上部，怪兽站到卡片侧面够得着水泡的位置
    const target = {
      x: 170 + Math.random() * Math.max(1, width - 340),
      y: 140 + Math.random() * Math.max(1, height - 300)
    };
    card.style.left = `${target.x}px`;
    card.style.top = `${target.y}px`;
    // 怪兽默认站卡片左侧朝右戳泡；卡片偏左时换到右侧并镜像。偏移按指泡帧
    // 实测反推（指尖约在帧宽 95%、高 40% 处），身体让开水泡、指尖点在泡缘
    const flip = target.x <= width / 2;
    const spot = {
      x: target.x + (flip ? -30 : -198),
      y: target.y - 83
    };
    if (flip) actor.classList.add("flip");
    // 图集怪兽面朝右：不镜像时从左缘进、右缘出，镜像时相反，避免倒着走路。
    // 出场改为雷欧驮着怪兽朝面向一侧高空飞离；终点留足整格余量，
    // 保证骑乘帧的完整人马都飞出舞台后才清理，不会半路凭空消失
    const start = flip ? {x: width + 70, y: spot.y} : {x: -70, y: spot.y};
    const exit = flip ? {x: -260, y: -260} : {x: width + 260, y: -260};

    let current = null;
    let skipped = false;
    const waits = new Set();
    const wait = ms => new Promise(resolve => {
      if (skipped) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        waits.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      waits.add(done);
    });
    const finish = () => {
      skipped = true;
      current?.cancel();
      // 表演阶段的等待没有对应的 WAAPI，直接放行让清理立即执行
      for (const done of waits) done();
    };
    actor.addEventListener("click", finish);

    const move = (from, to, duration) => {
      if (skipped) return Promise.resolve();
      current = wrapper.animate([
        {transform: `translate(${from.x}px, ${from.y}px)`},
        {transform: `translate(${to.x}px, ${to.y}px)`}
      ], {duration, easing: "linear", fill: "both"});
      return current.finished.catch(() => {});
    };
    // 戳破水泡：水珠飞溅，头像亮起，怪兽改口「赶紧的一同拯救世界去」
    const popBubble = () => {
      card.classList.remove("is-poked");
      card.classList.add("is-popped");
      speech.textContent = "赶紧的一同拯救世界去";
      const ring = document.createElement("i");
      ring.className = "celebration-ring";
      figure.append(ring);
      for (let i = 0; i < 8; i++) {
        const drop = document.createElement("i");
        drop.className = "celebration-drop";
        figure.append(drop);
        const angle = i * 0.785 + 0.4;
        const distance = 40 + (i % 3) * 16;
        drop.animate([
          {transform: "translate(0, 0) scale(1)", opacity: 1},
          {transform: `translate(${Math.round(Math.cos(angle) * distance)}px, ${Math.round(Math.sin(angle) * distance - 10)}px) scale(0.3)`, opacity: 0}
        ], {duration: 520 + (i % 3) * 90, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)", fill: "forwards"});
      }
    };

    // 帧时间轴与 promise 链对齐：走 0-2.4s（8 帧/秒），戳 2.4-3.2s，欢呼 3.2-4.5s
    // （图集前 5 帧，末帧定格举臂），4.5-5.125s 雷欧入画让怪兽原地骑上（5-9 帧），
    // 骑稳后 5.125s 起循环 10-14 帧飞离
    const paintStart = performance.now();
    const paint = now => {
      if (skipped) return;
      const t = (now - paintStart) / 1000;
      if (t < 2.4) drawMonsterFrame(monster, sheets.walk, Math.floor(t * 8) % 15, flip);
      else if (t < 3.2) drawMonsterFrame(monster, sheets.point, 11 + Math.min(3, Math.floor((t - 2.4) * 8)), flip);
      else if (t < 4.5) drawMonsterFrame(monster, sheets.leo, Math.min(4, Math.floor((t - 3.2) * 6)), flip);
      else if (t < 5.125) drawMonsterFrame(monster, sheets.leo, 5 + Math.min(4, Math.floor((t - 4.5) * 8)), flip);
      else drawMonsterFrame(monster, sheets.leo, 10 + Math.floor((t - 5.125) * 8) % 5, flip);
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);

    wrapper.style.transform = `translate(${start.x}px, ${start.y}px)`;
    move(start, spot, 2400)
      .then(() => {
        // 俯身轻戳两下水泡，泡泡跟着晃
        card.classList.add("is-poked");
        actor.classList.add("is-poking");
        return wait(800);
      })
      .then(() => {
        actor.classList.remove("is-poking");
        popBubble();
        // 雷欧入画让怪兽原地骑上（欢呼 1.3 秒 + 上鞍 0.625 秒），骑稳后再一同飞离
        return wait(1925);
      })
      .then(() => {
        // 雷欧驮走怪兽，成员保持队形同步飞离：与怪兽同时起飞、同速同向，
        // 卡片终点 = 怪兽终点 + 起飞时卡片相对怪兽画布的偏移，全程队形不变
        const off = {x: target.x - spot.x, y: target.y - spot.y};
        const dx = exit.x + off.x - target.x;
        const dy = exit.y + off.y - target.y;
        card.animate([
          {transform: "translate(-50%, -50%)"},
          {transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) rotate(${flip ? -5 : 5}deg)`}
        ], {duration: 1600, easing: "linear", fill: "forwards"});
        return move(spot, exit, 1600);
      })
      .finally(() => {
        skipped = true;
        current?.cancel();
        wrapper.remove();
        card.remove();
      });
  }

  elements.celebrationPopoverClose.addEventListener("click", closeCelebrationPopover);
  elements.celebrationPopoverJoin.addEventListener("click", () => {
    commitCelebrationDraft();
  });
  elements.celebrationPopoverRemove.addEventListener("click", () => {
    if (!celebrationDraft) return;
    setCelebrationMember(celebrationDraft.gid, celebrationDraft.senderId, null);
    elements.celebrationPopoverRemove.hidden = true;
    elements.celebrationPopoverJoin.hidden = false;
  });
  elements.celebrationInterval.addEventListener("change", () => {
    // 已在名单里的成员，改间隔立即生效；新成员点「加入庆祝名单」保存
    if (celebrationDraft
      && celebrationEntry(celebrationDraft.gid, celebrationDraft.senderId)) {
      commitCelebrationDraft();
    }
  });
  document.addEventListener("click", event => {
    if (elements.celebrationPopover.hidden) return;
    if (elements.celebrationPopover.contains(event.target)) return;
    // 点在打开弹层的入口上时不关闭，由入口自己的处理接管
    if (event.target.closest(".message-sender, .celebration-chip-name")) return;
    closeCelebrationPopover();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.celebrationPopover.hidden) {
      closeCelebrationPopover();
    }
  });

  renderCelebrationRoster();

  updateFollowIndicator();
  initialize();
  checkLoginStatus();
})();
