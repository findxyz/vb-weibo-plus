import {fetchJson} from "../shared/fetch.js";
import {createQrLogin} from "../shared/qr-login.js";
import {createMessageView} from "./message-view.js";
import {createAnalysis} from "./analysis.js";
import {createHistory} from "./history.js";
import {createCelebration} from "./celebration.js";
import {createComposer} from "./composer.js";
import {createGroupList} from "./group-list.js";
import {createConversationSession} from "./conversation-session.js";
import {createDream} from "./dream.js";
import {createAttitudes} from "./attitudes.js";
import {createEmojiPanel} from "./emoji-panel.js";

function bootstrap() {
  const PAGE_SIZE = 50;
  const HISTORY_SEARCH_PAGE_SIZE = 20;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const IMMERSIVE_KEY = "weibo-chat:immersive";
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
    historyClose: document.querySelector("#history-close"), historyTitle: document.querySelector("#history-title"),
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
    loginCheckTick: 0, pendingRefresh: false,
    lastSizeGid: null, lastMessageCount: null
  };

  let celebration;
  // 首屏与向上翻页都是「垫高庆祝基线 + 补一次表态」，共用同一回调
  function seedCelebrationAndAttitudes(gid, messages) {
    celebration.seed(gid, messages);
    attitudes.load(gid, messages);
  }
  // 各工厂只收自己用到的元素句柄：按工厂签名里的名单挑子集，不再整包透传
  const pickElements = (...keys) => Object.fromEntries(keys.map(key => [key, elements[key]]));
  const messageView = createMessageView({
    elements: pickElements("imageViewer", "imageViewerImage", "imageViewerState"),
    getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {},
    isAdminSender,
    onSenderClick: (...args) => celebration.openPopover(...args)
  });
  const conversation = createConversationSession({
    elements: pickElements("messages", "newMessages"),
    messageView,
    pageSize: PAGE_SIZE, earlierLoadThreshold: 120,
    onInitialMessages: seedCelebrationAndAttitudes,
    onEarlierMessages: seedCelebrationAndAttitudes,
    onNewMessages: (gid, messages) => {
      celebration.process(gid, messages);
      attitudes.load(gid, messages);
    }
  });
  const attitudes = createAttitudes({
    elements: pickElements("attitudesToggle"),
    getCurrentGid: () => state.currentGid,
    getRenderedMessages: () => conversation.getRenderedMessages(),
    applyAttitudes: conversation.applyAttitudes
  });
  createEmojiPanel({
    elements: pickElements("emojiPickerOpen", "emojiPanel", "emojiPanelGrid", "composer"),
    getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {}
  });
  const analysis = createAnalysis({
    elements: pickElements(
      "analysisDialog", "analysisOpen", "analysisClose", "analysisTitle", "analysisForm",
      "analysisDate", "analysisPrompt", "analysisSubmit", "analysisBack", "analysisDownload",
      "analysisEmpty", "analysisFeedback", "analysisResults", "analysisList", "analysisPageState",
      "analysisPrev", "analysisNext", "analysisDetail", "analysisDetailMeta", "analysisDetailContent")
  });
  celebration = createCelebration({
    elements: pickElements(
      "celebrationRoster", "celebrationStage", "celebrationInterval", "celebrationPopover",
      "celebrationPopoverTitle", "celebrationPopoverJoin", "celebrationPopoverRemove",
      "celebrationPopoverClose"),
    messageView, getCurrentGid: () => state.currentGid,
    getMessages: () => conversation.getMessagesSnapshot()
  });
  createComposer({
    elements: pickElements(
      "composer", "composerHint", "imagePickerOpen", "imageInput", "videoPickerOpen",
      "videoInput", "composerAttachment", "composerAttachmentPreview",
      "composerAttachmentPreviewVideo", "composerAttachmentRemove"),
    getGid: () => state.currentGid,
    onRefresh: gid => conversation.refreshAfterSend(gid),
    onSent: gid => conversation.followLatest(gid)
  });
  const groupList = createGroupList({
    elements: pickElements("groupSearch", "groupsCount", "groupsList"),
    messageView,
    getCurrentGid: () => state.currentGid, onSelect: selectGroup,
    onGroupsChanged: groups => {
      const current = groups.find(item => item.gid === state.currentGid);
      if (current) conversation.updateGroup(current);
      updateCurrentGroupHeader();
    }
  });
  const history = createHistory({
    elements: pickElements(
      "historyDialog", "historyOpen", "historyClose", "historyBack", "historyForm",
      "historyKeyword", "historySender", "historyStart", "historyEnd", "historySync",
      "historySyncTime", "historyTitle", "historyMessages", "historyEmpty", "historyFeedback",
      "historyPageState", "historyNewerState", "historyEarlierState", "historyPrevious",
      "historyNext", "historyResults", "historyResultsList", "historyContext"),
    pageSize: PAGE_SIZE, searchPageSize: HISTORY_SEARCH_PAGE_SIZE, earlierLoadThreshold: 120,
    messageView
  });
  createDream({
    elements: pickElements(
      "messages", "dreamPopover", "dreamEnter", "dreamPopoverClose",
      "dreamDialog", "dreamFrame", "dreamClose")
  });

  function isAdminSender(senderId) {
    if (!Number.isSafeInteger(senderId) || senderId <= 0) return false;
    const group = groupList.findGroup(state.currentGid);
    return Array.isArray(group?.admins) && group.admins.includes(senderId);
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

  const LOGIN_CHECK_INTERVAL = 60;
  // 扫码登录交给 shared 控制器：防重入、首拉延迟、10 秒轮询与按钮 loading 态都在那里
  const qrLogin = createQrLogin({
    button: elements.loginQr,
    image: elements.loginQrImg,
    loading: elements.qrLoading,
    idleText: "📱 扫码登录",
    loadingText: "📱 扫码中…",
    onSuccess: async () => {
      elements.loginExpired.hidden = true;
      await initialize();
    },
    onError: () => {
      elements.groupsState.textContent = "扫码登录失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    }
  });
  function maybeCheckLoginStatus() {
    if (document.hidden || qrLogin.pending || ++state.loginCheckTick < LOGIN_CHECK_INTERVAL) return;
    state.loginCheckTick = 0; checkLoginStatus();
  }
  async function checkLoginStatus() {
    try {
      const result = await fetchJson("/weibo/login/status", {cache: "no-store"});
      elements.loginExpired.hidden = result.valid !== false;
    }
    catch (error) { console.warn("检查登录状态失败：", error); }
  }
  async function initialize() {
    state.initializing = true; elements.retryGroups.hidden = true; elements.groupsState.textContent = "";
    try {
      const groups = await groupList.loadInitial();
      if (!groups.length) return;
      const savedGid = Number(localStorage.getItem(LAST_GROUP_KEY));
      await selectGroup((groups.find(group => group.gid === savedGid) || groups[0]).gid);
    } catch (error) {
      console.warn("加载群聊列表失败：", error);
      elements.groupsCount.textContent = "加载失败"; elements.groupsState.textContent = "群聊列表加载失败，请稍后重试。"; elements.retryGroups.hidden = false;
    }
    finally { state.initializing = false; if (state.pendingRefresh) { state.pendingRefresh = false; refreshView(); } }
  }

  elements.retryGroups.addEventListener("click", initialize);
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
  initialize(); checkLoginStatus();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, {once: true});
else bootstrap();
