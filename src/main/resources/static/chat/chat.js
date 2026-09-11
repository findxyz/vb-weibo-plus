import {calendarMonthsAgo, localDateValue} from "../shared/date.js";
import {fetchJson} from "../shared/fetch.js";
import {
  captureScrollAnchor,
  compareMessages,
  restoreScrollAnchor
} from "./chat-common.js";
import {createMessageView} from "./message-view.js";
import {createAnalysis} from "./analysis.js";
import {createHistory} from "./history.js";
import {createCelebration} from "./celebration.js";
import {createComposer} from "./composer.js";
import {createGroupList} from "./group-list.js";
import {createConversationSession} from "./conversation-session.js";
import {createDream} from "./dream.js";

function bootstrap() {
  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const IMMERSIVE_KEY = "weibo-chat:immersive";
  const ATTITUDES_KEY = "weibo-chat:attitudes";
  const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};
  const RED_PACKET_TEXT = "收到红包消息";
  const elements = {
    appTitle: document.querySelector("#app-title"), groupsCount: document.querySelector("#groups-count"),
    groupsList: document.querySelector("#groups-list"), groupsState: document.querySelector("#groups-state"),
    retryGroups: document.querySelector("#retry-groups"), groupSearch: document.querySelector("#group-search"),
    currentGroup: document.querySelector("#current-group"), currentSize: document.querySelector("#current-size"),
    currentId: document.querySelector("#current-id"), currentAvatar: document.querySelector("#current-group-avatar"),
    messages: document.querySelector("#messages"), newMessages: document.querySelector("#new-messages"),
    historyOpen: document.querySelector("#history-open"),
    attitudesToggle: document.querySelector("#attitudes-toggle"),
    emojiPickerOpen: document.querySelector("#emoji-picker-open"), emojiPanel: document.querySelector("#emoji-panel"),
    emojiPanelGrid: document.querySelector("#emoji-panel-grid"), historyDialog: document.querySelector("#history-dialog"),
    historyClose: document.querySelector("#history-close"),
    historyForm: document.querySelector("#history-form"), historyStart: document.querySelector("#history-start"),
    historyEnd: document.querySelector("#history-end"), historySender: document.querySelector("#history-sender"),
    historyKeyword: document.querySelector("#history-keyword"), historyEmpty: document.querySelector("#history-empty"),
    historyResults: document.querySelector("#history-results"), historyResultsList: document.querySelector("#history-results-list"),
    historyContext: document.querySelector("#history-context"), historyBack: document.querySelector("#history-back"),
    historyMessages: document.querySelector("#history-messages"), historyEarlierState: document.querySelector("#history-earlier-state"),
    historyNewerState: document.querySelector("#history-newer-state"), historyFeedback: document.querySelector("#history-feedback"),
    historyPrevious: document.querySelector("#history-previous"), historyNext: document.querySelector("#history-next"),
    historyPageState: document.querySelector("#history-page-state"), historySyncTime: document.querySelector("#history-sync-time"),
    historySync: document.querySelector("#history-sync"), imageViewer: document.querySelector("#image-viewer"),
    imageViewerImage: document.querySelector("#image-viewer img"), imageViewerState: document.querySelector("#image-viewer-state"),
    composer: document.querySelector("#composer"), composerHint: document.querySelector("#composer-hint"),
    composerAttachment: document.querySelector("#composer-attachment"), composerAttachmentPreview: document.querySelector("#composer-attachment-preview"),
    composerAttachmentPreviewVideo: document.querySelector("#composer-attachment-preview-video"), composerAttachmentRemove: document.querySelector("#composer-attachment-remove"),
    imagePickerOpen: document.querySelector("#image-picker-open"), imageInput: document.querySelector("#image-input"),
    videoPickerOpen: document.querySelector("#video-picker-open"), videoInput: document.querySelector("#video-input"),
    loginExpired: document.querySelector("#login-expired"), loginQr: document.querySelector("#login-qr"),
    loginQrImg: document.querySelector("#login-qr-img"), qrLoading: document.querySelector("#qr-loading"),
    analysisOpen: document.querySelector("#analysis-open"), analysisDialog: document.querySelector("#analysis-dialog"),
    analysisClose: document.querySelector("#analysis-close"), analysisTitle: document.querySelector("#analysis-title"),
    analysisForm: document.querySelector("#analysis-form"), analysisDate: document.querySelector("#analysis-date"),
    analysisPrompt: document.querySelector("#analysis-prompt"), analysisSubmit: document.querySelector("#analysis-submit"),
    analysisFeedback: document.querySelector("#analysis-feedback"), analysisEmpty: document.querySelector("#analysis-empty"),
    analysisResults: document.querySelector("#analysis-results"), analysisList: document.querySelector("#analysis-list"),
    analysisPrev: document.querySelector("#analysis-prev"), analysisNext: document.querySelector("#analysis-next"),
    analysisPageState: document.querySelector("#analysis-page-state"), analysisDetail: document.querySelector("#analysis-detail"),
    analysisBack: document.querySelector("#analysis-back"), analysisDownload: document.querySelector("#analysis-download"),
    analysisDetailContent: document.querySelector("#analysis-detail-content"), analysisDetailMeta: document.querySelector("#analysis-detail-meta"),
    conversation: document.querySelector(".conversation"), immersiveToggle: document.querySelector("#immersive-toggle"),
    windowToggle: document.querySelector(".window-control.toggle"), celebrationStage: document.querySelector("#celebration-stage"),
    celebrationRoster: document.querySelector("#celebration-roster"), celebrationPopover: document.querySelector("#celebration-popover"),
    celebrationPopoverTitle: document.querySelector("#celebration-popover-title"), celebrationPopoverClose: document.querySelector("#celebration-popover-close"),
    celebrationPopoverRemove: document.querySelector("#celebration-popover-remove"), celebrationInterval: document.querySelector("#celebration-interval"),
    celebrationPopoverJoin: document.querySelector("#celebration-popover-join"),
    dreamPopover: document.querySelector("#dream-popover"), dreamEnter: document.querySelector("#dream-enter"),
    dreamPopoverClose: document.querySelector("#dream-popover-close"),
    dreamDialog: document.querySelector("#dream-dialog"), dreamFrame: document.querySelector("#dream-frame"),
    dreamClose: document.querySelector("#dream-close")
  };
  const state = {
    currentGid: null, initializing: false,
    loginCheckTick: 0, loginPending: false, pendingRefresh: false,
    lastSizeGid: null, lastMessageCount: null
  };

  let celebration;
  // 首屏与向上翻页都是「垫高庆祝基线 + 补一次表态」，共用同一回调
  function seedCelebrationAndAttitudes(gid, messages) {
    celebration.seed(gid, messages);
    loadAttitudes(gid, messages);
  }
  const messageView = createMessageView({
    imageViewer: elements.imageViewer, imageViewerImage: elements.imageViewerImage,
    imageViewerState: elements.imageViewerState, getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {},
    mediaTypes: MEDIA_TYPE, formatTime, isAdminSender,
    onSenderClick: (...args) => celebration.openPopover(...args)
  });
  const conversation = createConversationSession({
    elements, messageView, fetchJson, compareMessages, captureScrollAnchor, restoreScrollAnchor,
    pageSize: PAGE_SIZE, earlierLoadThreshold: 120,
    onInitialMessages: seedCelebrationAndAttitudes,
    onEarlierMessages: seedCelebrationAndAttitudes,
    onNewMessages: (gid, messages) => {
      celebration.process(gid, messages);
      loadAttitudes(gid, messages);
    }
  });
  const analysis = createAnalysis({elements, fetchJson, localDateValue});
  celebration = createCelebration({
    elements, messageView, getCurrentGid: () => state.currentGid,
    getMessages: () => conversation.getMessagesSnapshot(), compareMessages
  });
  const composer = createComposer({
    elements, getGid: () => state.currentGid,
    onRefresh: gid => conversation.refreshAfterSend(gid),
    onSent: gid => conversation.followLatest(gid)
  });
  const groupList = createGroupList({
    elements, messageView, fetchJson,
    getCurrentGid: () => state.currentGid, onSelect: selectGroup,
    onGroupsChanged: groups => {
      const current = groups.find(item => item.gid === state.currentGid);
      if (current) conversation.updateGroup(current);
      updateCurrentGroupHeader();
    }
  });
  const history = createHistory({
    elements, fetchJson, localDateValue, calendarMonthsAgo,
    pageSize: PAGE_SIZE, searchPageSize: HISTORY_SEARCH_PAGE_SIZE, earlierLoadThreshold: 120,
    compareMessages, captureScrollAnchor, restoreScrollAnchor, messageView, formatDateTime,
    mediaTypes: MEDIA_TYPE, redPacketText: RED_PACKET_TEXT
  });
  createDream({
    messages: elements.messages, popover: elements.dreamPopover, enterButton: elements.dreamEnter,
    popoverClose: elements.dreamPopoverClose,
    dialog: elements.dreamDialog, frame: elements.dreamFrame, closeButton: elements.dreamClose
  });

  const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  });

  function formatTime(timestamp) { return timeFormatter.format(new Date(timestamp)); }
  function formatDateTime(timestamp) { return dateTimeFormatter.format(new Date(timestamp)); }
  function isAdminSender(senderId) {
    if (!Number.isSafeInteger(senderId) || senderId <= 0) return false;
    const group = groupList.findGroup(state.currentGid);
    return Array.isArray(group?.admins) && group.admins.includes(senderId);
  }

  let emojiPanelBuilt = false;
  function toggleEmojiPanel(forceOpen) {
    const open = forceOpen ?? elements.emojiPanel.hidden;
    if (open && !emojiPanelBuilt) {
      for (const [phrase, url] of Object.entries(window.WEIBO_EMOJI_MAP || {})) {
        const image = document.createElement("img");
        image.className = "emoji-cell"; image.src = url; image.alt = phrase; image.title = phrase; image.loading = "lazy";
        elements.emojiPanelGrid.append(image);
      }
      emojiPanelBuilt = true;
    }
    elements.emojiPanel.hidden = !open;
  }
  function insertEmoji(phrase) {
    const start = elements.composer.selectionStart ?? elements.composer.value.length;
    const end = elements.composer.selectionEnd ?? elements.composer.value.length;
    elements.composer.setRangeText(phrase, start, end, "end");
    elements.composer.focus(); elements.composer.dispatchEvent(new Event("input", {bubbles: true}));
  }

  let attitudesEnabled = localStorage.getItem(ATTITUDES_KEY) === "1";
  function applyAttitudesToggle() {
    elements.attitudesToggle.classList.toggle("active", attitudesEnabled);
    elements.attitudesToggle.setAttribute("aria-pressed", String(attitudesEnabled));
    const label = attitudesEnabled ? "表态已打开，随每次查询实时刷新" : "是否打开表态";
    elements.attitudesToggle.setAttribute("aria-label", label);
    elements.attitudesToggle.title = label;
  }
  // 开关打开时立即为当前可见窗口补一次表态，不等下一次查询
  function loadVisibleAttitudes() {
    loadAttitudes(state.currentGid, conversation.getRenderedMessages());
  }
  // 开关打开时随每次查询实时拉取这批消息的表态，结果由会话模块统一应用；
  // 失败静默降级，不影响消息本身展示。
  async function loadAttitudes(gid, items) {
    if (!attitudesEnabled || !items.length || gid !== state.currentGid) return;
    const mids = [...new Set(items.map(message => String(message.mid)))];
    try {
      const result = await fetchJson(
        `/chat/attitudes?${new URLSearchParams({gid: String(gid), mids: mids.join(",")})}`,
        {cache: "no-store"});
      if (gid !== state.currentGid) return;
      conversation.applyAttitudes(gid, result);
    } catch (error) {
      console.warn("获取表态失败：", error);
    }
  }

  async function selectGroup(gid) {
    const group = groupList.findGroup(gid);
    if (!group) return;
    if (state.currentGid !== gid) { celebration.cancel(); history.close(); }
    state.currentGid = gid;
    history.setGroup(group); analysis.setGroup(group);
    celebration.render();
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    elements.currentId.textContent = String(group.gid);
    elements.historyOpen.disabled = false; elements.emojiPickerOpen.disabled = false;
    elements.imagePickerOpen.disabled = false; elements.videoPickerOpen.disabled = false;
    const avatarElement = messageView.avatar(group, "main-group-avatar");
    elements.currentAvatar.replaceWith(avatarElement);
    elements.currentAvatar = avatarElement;
    elements.appTitle.textContent = `微博群聊 - ${elements.currentGroup.textContent}`;
    document.title = elements.appTitle.textContent;
    updateCurrentGroupHeader();
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      const active = row.dataset.gid === String(gid);
      row.classList.toggle("active", active);
      if (active) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
    });
    const loading = conversation.open(group);
    return loading;
  }

  function updateCurrentGroupHeader() {
    const group = groupList.findGroup(state.currentGid);
    if (!group) return;
    if (typeof group.messageCount !== "number") {
      elements.currentSize.textContent = `${group.maxMember || group.memberCount} 人群`;
      return;
    }
    const prefix = `${group.maxMember || group.memberCount} 人群 + `;
    let count = elements.currentSize.querySelector(".current-message-count");
    if (!count) {
      count = document.createElement("span"); count.className = "current-message-count";
      elements.currentSize.replaceChildren(document.createTextNode(prefix), count, document.createTextNode(" 条消息"));
    } else elements.currentSize.firstChild.textContent = prefix;
    count.textContent = String(group.messageCount);
    if (state.lastSizeGid !== state.currentGid) {
      state.lastSizeGid = state.currentGid; state.lastMessageCount = group.messageCount; return;
    }
    if (group.messageCount !== state.lastMessageCount) {
      state.lastMessageCount = group.messageCount; count.classList.remove("size-flash"); void count.offsetWidth; count.classList.add("size-flash");
    }
  }

  function refreshView() {
    if (state.initializing) { state.pendingRefresh = true; return; }
    groupList.refreshGroups(); conversation.refresh(); maybeCheckLoginStatus();
  }

  const LOGIN_CHECK_INTERVAL = 60; const QR_LOGIN_LOADING_TEXT = "📱 扫码中…"; const QR_IMAGE_INTERVAL = 10000;
  let qrImageTimer = null;
  function refreshQrImage() {
    const image = new Image();
    image.onload = () => { elements.qrLoading.hidden = true; elements.loginQrImg.src = image.src; elements.loginQrImg.hidden = false; };
    image.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }
  function startQrImagePolling() { elements.loginQrImg.hidden = true; elements.qrLoading.hidden = false; qrImageTimer = setInterval(refreshQrImage, QR_IMAGE_INTERVAL); setTimeout(refreshQrImage, 3000); }
  function stopQrImagePolling() { if (qrImageTimer) clearInterval(qrImageTimer); qrImageTimer = null; elements.loginQrImg.hidden = true; elements.qrLoading.hidden = true; }
  function maybeCheckLoginStatus() {
    if (document.hidden || state.loginPending || ++state.loginCheckTick < LOGIN_CHECK_INTERVAL) return;
    state.loginCheckTick = 0; checkLoginStatus();
  }
  async function checkLoginStatus() {
    try {
      const response = await fetch("/weibo/login/status", {cache: "no-store"});
      if (!response.ok) return;
      const result = await response.json();
      elements.loginExpired.hidden = result.valid !== false;
    }
    catch (error) { console.warn("检查登录状态失败：", error); }
  }
  async function startQrLogin() {
    if (state.loginPending) return;
    state.loginPending = true; elements.loginQr.disabled = true; elements.loginQr.textContent = QR_LOGIN_LOADING_TEXT; startQrImagePolling();
    try { const response = await fetch("/weibo/login/qr", {method: "POST"}); if (!response.ok) throw new Error(`HTTP ${response.status}`); elements.loginExpired.hidden = true; await initialize(); }
    catch { elements.groupsState.textContent = "扫码登录失败，请稍后重试。"; elements.retryGroups.hidden = false; }
    finally { stopQrImagePolling(); state.loginPending = false; elements.loginQr.disabled = false; elements.loginQr.textContent = "📱 扫码登录"; }
  }
  async function initialize() {
    state.initializing = true; elements.retryGroups.hidden = true; elements.groupsState.textContent = "";
    try {
      const groups = await groupList.loadInitial();
      if (!groups.length) return;
      const savedGid = Number(localStorage.getItem(LAST_GROUP_KEY));
      await selectGroup((groups.find(group => group.gid === savedGid) || groups[0]).gid);
    } catch { elements.groupsCount.textContent = "加载失败"; elements.groupsState.textContent = "群聊列表加载失败，请稍后重试。"; elements.retryGroups.hidden = false; }
    finally { state.initializing = false; if (state.pendingRefresh) { state.pendingRefresh = false; refreshView(); } }
  }

  elements.retryGroups.addEventListener("click", initialize);
  elements.loginQr.addEventListener("click", startQrLogin);
  elements.attitudesToggle.addEventListener("click", () => {
    attitudesEnabled = !attitudesEnabled;
    localStorage.setItem(ATTITUDES_KEY, attitudesEnabled ? "1" : "0");
    applyAttitudesToggle();
    if (attitudesEnabled) loadVisibleAttitudes();
  });
  elements.emojiPickerOpen.addEventListener("click", () => toggleEmojiPanel());
  elements.emojiPanelGrid.addEventListener("click", event => { const cell = event.target.closest(".emoji-cell"); if (cell) insertEmoji(cell.alt); });
  document.addEventListener("click", event => { if (!elements.emojiPanel.hidden && !elements.emojiPanel.contains(event.target) && !elements.emojiPickerOpen.contains(event.target)) toggleEmojiPanel(false); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !elements.emojiPanel.hidden) toggleEmojiPanel(false); });
  window.addEventListener("focus", refreshView);
  window.addEventListener("blur", () => conversation.markAway());
  document.addEventListener("visibilitychange", () => { if (document.hidden) conversation.markAway(); else refreshView(); });
  setInterval(refreshView, 3_000);
  elements.windowToggle.addEventListener("click", () => { location.href = "/post/index.html"; });
  function applyImmersive(enabled) {
    elements.conversation.classList.toggle("immersive", enabled); elements.immersiveToggle.setAttribute("aria-pressed", String(enabled));
    const label = enabled ? "退出沉浸阅读" : "进入沉浸阅读"; elements.immersiveToggle.setAttribute("aria-label", label); elements.immersiveToggle.setAttribute("title", label);
  }
  function setImmersive(enabled) {
    localStorage.setItem(IMMERSIVE_KEY, enabled ? "1" : "0");
    applyImmersive(enabled);
  }
  applyImmersive(localStorage.getItem(IMMERSIVE_KEY) === "1");
  elements.immersiveToggle.addEventListener("click", () => setImmersive(!elements.conversation.classList.contains("immersive")));
  applyAttitudesToggle();
  initialize(); checkLoginStatus();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, {once: true});
else bootstrap();
