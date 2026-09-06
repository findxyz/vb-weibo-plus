import {
  captureScrollAnchor,
  compareMessages,
  fetchJson,
  restoreScrollAnchor
} from "./chat-common.js";
import {createMessageView} from "./message-view.js";
import {createAnalysis} from "./analysis.js";
import {createHistory} from "./history.js";
import {createCelebration} from "./celebration.js";
import {createComposer} from "./composer.js";
import {createGroupList} from "./group-list.js";

function bootstrap() {
  "use strict";

  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const EARLIER_LOAD_THRESHOLD = 120;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const IMMERSIVE_KEY = "weibo-chat:immersive";
  const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};
  const RED_PACKET_TEXT = "收到红包消息";
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
    switchingGroup: false,
    groupLoadVersion: 0,
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
    loginPending: false,
    pendingRefresh: false
  };
  const messageView = createMessageView({
    imageViewer: elements.imageViewer,
    imageViewerImage: elements.imageViewerImage,
    imageViewerState: elements.imageViewerState,
    getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {},
    mediaTypes: MEDIA_TYPE,
    formatTime,
    isAdminSender,
    onSenderClick: (...args) => celebration.openPopover(...args)
  });
  const analysis = createAnalysis({elements, fetchJson, localDateValue});
  const celebration = createCelebration({
    elements, messageView, getCurrentGid: () => state.currentGid,
    getMessages: () => state.messages.values(), compareMessages
  });
  const composer = createComposer({
    elements, getGid: () => state.currentGid,
    onRefresh: gid => refreshMessages(gid),
    onSent: () => { state.followingLatest = true; }
  });
  const groupList = createGroupList({
    elements, messageView, getGroups: () => state.groups,
    getCurrentGid: () => state.currentGid, onSelect: gid => selectGroup(gid)
  });
  const history = createHistory({
    elements, fetchJson, localDateValue, calendarMonthsAgo,
    pageSize: PAGE_SIZE, searchPageSize: HISTORY_SEARCH_PAGE_SIZE,
    earlierLoadThreshold: EARLIER_LOAD_THRESHOLD, compareMessages,
    captureScrollAnchor, restoreScrollAnchor, messageView, formatDateTime,
    mediaTypes: MEDIA_TYPE, redPacketText: RED_PACKET_TEXT
  });


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

  let emojiPanelBuilt = false;

  function buildEmojiPanel() {
    if (emojiPanelBuilt) return;
    const grid = elements.emojiPanelGrid;
    for (const [phrase, url] of Object.entries(window.WEIBO_EMOJI_MAP || {})) {
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

  function isAdminSender(senderId) {
    if (!Number.isSafeInteger(senderId) || senderId <= 0) return false;
    const group = state.groups.find(item => item.gid === state.currentGid);
    return Array.isArray(group?.admins) && group.admins.includes(senderId);
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
      elements.messages.replaceChildren(...ordered.map(message => messageView.messageElement(
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
        el = messageView.messageElement(message, null, onLoad, state.currentGid);
        if (prevEl) prevEl.after(el);
        else elements.messages.prepend(el);
      }
      prevEl = el;
    }
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

  async function selectGroup(gid) {
    const group = state.groups.find(item => item.gid === gid);
    if (!group) return;
    const version = ++state.groupLoadVersion;
    state.switchingGroup = true;
    if (state.currentGid !== gid) celebration.cancel();
    history.setGroup(group);
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
    celebration.render();
    elements.historyOpen.disabled = false;
    elements.emojiPickerOpen.disabled = false;
    elements.imagePickerOpen.disabled = false;
    elements.videoPickerOpen.disabled = false;
    elements.historyTitle.textContent = `聊天记录 - ${group.name || `群聊 ${group.gid}`}`;
    analysis.setGroup(group);
    elements.currentAvatar.replaceWith(messageView.avatar(group, "main-group-avatar"));
    elements.currentAvatar = document.querySelector(".main-group-avatar");
    elements.appTitle.textContent = `微博群聊 - ${elements.currentGroup.textContent}`;
    document.title = elements.appTitle.textContent;
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      const active = row.dataset.gid === String(gid);
      row.classList.toggle("active", active);
      if (active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
    try {
      await loadMessages(null, null);
    } finally {
      if (state.groupLoadVersion === version) state.switchingGroup = false;
    }
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
    const anchor = isLatestPage ? null : captureScrollAnchor(elements.messages);
    const gid = state.currentGid;
    const version = state.groupLoadVersion;
    const query = new URLSearchParams({
      gid: String(gid), size: String(PAGE_SIZE)
    });
    if (!isLatestPage) {
      query.set("beforeCreatedAt", String(beforeCursor.createdAt));
      query.set("beforeMid", String(beforeCursor.mid));
    }
    try {
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid || state.groupLoadVersion !== version) return;
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
        celebration.seed(gid, result.items);
      } else {
        renderMessages();
        restoreScrollAnchor(anchor, elements.messages);
        // 向上翻页加载的旧消息同样算亲眼见证，垫高基线（只增不减）
        celebration.seed(gid, result.items);
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
    if (!state.currentGid || state.initializing || state.switchingGroup
      || state.refreshing || document.hidden) return;
    state.refreshing = true;
    const gid = state.currentGid;
    const version = state.groupLoadVersion;
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
      if (state.currentGid !== gid || state.groupLoadVersion !== version) return;
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
        celebration.process(gid, fresh);
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
    const version = state.groupLoadVersion;
    const latest = [...state.messages.values()].reduce((left, right) =>
      compareMessages(left, right) >= 0 ? left : right);
    let cursor = {createdAt: latest.createdAt, mid: latest.mid};
    let added = false;
    while (!document.hidden && state.currentGid === gid
      && state.groupLoadVersion === version) {
      const query = new URLSearchParams({
        gid: String(gid), size: String(PAGE_SIZE),
        afterCreatedAt: String(cursor.createdAt), afterMid: String(cursor.mid)
      });
      const result = await fetchJson(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (state.currentGid !== gid || state.groupLoadVersion !== version) return false;
      result.items.forEach(message => state.messages.set(message.mid, message));
      if (result.items.length > 0) {
        added = true;
        renderMessages();
        // 追平的缺口同样算亲眼见证，符合条件的回归照常庆祝
        celebration.process(gid, result.items);
      }
      if (!result.hasMore || result.nextAfterCreatedAt === null
        || result.nextAfterMid === null) break;
      cursor = {createdAt: result.nextAfterCreatedAt, mid: result.nextAfterMid};
    }
    // 追平后不自动贴底，由“新消息”按钮提示，点击恢复跟随
    if (added && !state.followingLatest) elements.newMessages.hidden = false;
    return !document.hidden && state.currentGid === gid
      && state.groupLoadVersion === version;
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
      groupList.render();
      updateCurrentGroupHeader();
    } catch (error) {
      console.warn("刷新群聊列表失败：", error);
    } finally {
      state.refreshingGroups = false;
    }
  }

  function refreshView() {
    if (state.initializing) {
      state.pendingRefresh = true;
      return;
    }
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

  async function initialize() {
    state.initializing = true;
    elements.retryGroups.hidden = true;
    elements.groupsState.textContent = "";
    try {
      state.groups = await fetchJson("/chat/groups", {cache: "no-store"});
      groupList.render();
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
      if (state.pendingRefresh) {
        state.pendingRefresh = false;
        refreshView();
      }
    }
  }

  elements.messages.addEventListener("scroll", () => {
    state.followingLatest = isNearBottom();
    if (state.followingLatest) elements.newMessages.hidden = true;
    maybeLoadEarlierMessages();
  });
  elements.retryGroups.addEventListener("click", initialize);
  elements.loginQr.addEventListener("click", startQrLogin);
  elements.newMessages.addEventListener("click", async () => {
    await refreshMessages();
    state.followingLatest = true;
    elements.messages.scrollTop = elements.messages.scrollHeight;
    elements.newMessages.hidden = true;
  });
  elements.emojiPickerOpen.addEventListener("click", () => toggleEmojiPanel());
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



  updateFollowIndicator();
  initialize();
  checkLoginStatus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, {once: true});
} else {
  bootstrap();
}

