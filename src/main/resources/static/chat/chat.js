import {createMessageView} from "./message-view.js";
import {createAnalysis} from "./analysis.js";
import {createHistory} from "./history.js";
import {createCelebration} from "./celebration.js";
import {createComposer} from "./composer.js";
import {createGroups} from "./groups.js";
import {createSessions} from "./sessions.js";
import {createDream} from "./dream.js";
import {createAttitudes} from "./attitudes.js";
import {createEmojiPanel} from "./emoji-panel.js";
import {createLogin} from "./login.js";
import {pickElements} from "../shared/dom.js";

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
    scrollBottom: document.querySelector("#scroll-bottom"),
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
    pendingRefresh: false,
    lastSizeGid: null, lastMessageCount: null
  };

  let celebration;
  // 首屏与向上翻页都是「垫高庆祝基线 + 补一次表态」，共用同一回调
  function seedCelebrationAndAttitudes(gid, messages) {
    celebration.seed(gid, messages);
    void attitudes.load(gid, messages);
  }
  // 各工厂只收自己用到的元素句柄：按工厂签名里的名单挑子集，不再整包透传
  // 登录检测与扫码登录归 login 模块（与 post 页同一模式）；
  // 扫码成功后重走初始化，失败写回群聊面板状态行
  const login = createLogin({
    elements: pickElements(elements, "loginExpired", "loginQr", "loginQrImg", "qrLoading"),
    onRelogin: () => initialize(),
    onError: () => {
      elements.groupsState.textContent = "扫码登录失败，请稍后重试。";
      elements.retryGroups.hidden = false;
    }
  });
  const messageView = createMessageView({
    elements: pickElements(elements, "imageViewer", "imageViewerImage", "imageViewerState"),
    getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {},
    isAdminSender,
    onSenderClick: (...args) => celebration.openPopover(...args)
  });
  const sessions = createSessions({
    elements: pickElements(elements, "messages", "newMessages", "scrollBottom"),
    messageView,
    pageSize: PAGE_SIZE, earlierLoadThreshold: 120,
    onInitialMessages: seedCelebrationAndAttitudes,
    onEarlierMessages: seedCelebrationAndAttitudes,
    onNewMessages: (gid, messages) => {
      celebration.process(gid, messages);
      void attitudes.load(gid, messages);
    },
    onAuthExpired: login.showLoginExpired
  });
  const attitudes = createAttitudes({
    elements: pickElements(elements, "attitudesToggle"),
    getCurrentGid: () => state.currentGid,
    getRenderedMessages: () => sessions.getRenderedMessages(),
    applyAttitudes: sessions.applyAttitudes
  });
  createEmojiPanel({
    elements: pickElements(elements, "emojiPickerOpen", "emojiPanel", "emojiPanelGrid", "composer"),
    getWeiboEmojiMap: () => window.WEIBO_EMOJI_MAP || {}
  });
  const analysis = createAnalysis({
    elements: pickElements(elements, 
      "analysisDialog", "analysisOpen", "analysisClose", "analysisTitle", "analysisForm",
      "analysisDate", "analysisPrompt", "analysisSubmit", "analysisBack", "analysisDownload",
      "analysisEmpty", "analysisFeedback", "analysisResults", "analysisList", "analysisPageState",
      "analysisPrev", "analysisNext", "analysisDetail", "analysisDetailMeta", "analysisDetailContent")
  });
  celebration = createCelebration({
    elements: pickElements(elements, 
      "celebrationRoster", "celebrationStage", "celebrationInterval", "celebrationPopover",
      "celebrationPopoverTitle", "celebrationPopoverJoin", "celebrationPopoverRemove",
      "celebrationPopoverClose"),
    messageView, getCurrentGid: () => state.currentGid,
    getMessages: () => sessions.getMessagesSnapshot()
  });
  const composer = createComposer({
    elements: pickElements(elements, 
      "composer", "composerHint", "imagePickerOpen", "imageInput", "videoPickerOpen",
      "videoInput", "composerAttachment", "composerAttachmentPreview",
      "composerAttachmentPreviewVideo", "composerAttachmentRemove"),
    getGid: () => state.currentGid,
    onRefresh: gid => sessions.refreshAfterSend(gid)
  });
  const groups = createGroups({
    elements: pickElements(elements, "groupSearch", "groupsCount", "groupsList"),
    messageView,
    getCurrentGid: () => state.currentGid, onSelect: selectGroup,
    onGroupsChanged: list => {
      const current = list.find(item => item.gid === state.currentGid);
      if (current) sessions.updateGroup(current);
      updateCurrentGroupHeader();
    },
    onAuthExpired: login.showLoginExpired
  });
  const history = createHistory({
    elements: pickElements(elements, 
      "historyDialog", "historyOpen", "historyClose", "historyBack", "historyForm",
      "historyKeyword", "historySender", "historyStart", "historyEnd", "historySync",
      "historySyncTime", "historyTitle", "historyMessages", "historyEmpty", "historyFeedback",
      "historyPageState", "historyNewerState", "historyEarlierState", "historyPrevious",
      "historyNext", "historyResults", "historyResultsList", "historyContext"),
    pageSize: PAGE_SIZE, searchPageSize: HISTORY_SEARCH_PAGE_SIZE, earlierLoadThreshold: 120,
    messageView
  });
  createDream({
    elements: pickElements(elements, 
      "messages", "dreamPopover", "dreamEnter", "dreamPopoverClose",
      "dreamDialog", "dreamFrame", "dreamClose")
  });

  function isAdminSender(senderId) {
    if (!Number.isSafeInteger(senderId) || senderId <= 0) return false;
    const group = groups.findGroup(state.currentGid);
    return Array.isArray(group?.admins) && group.admins.includes(senderId);
  }

  async function selectGroup(gid) {
    const group = groups.findGroup(gid);
    if (!group) return;
    if (state.currentGid !== gid) { celebration.cancel(); history.close(); }
    state.currentGid = gid;
    history.setGroup(group); analysis.setGroup(group);
    celebration.render();
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    elements.currentId.textContent = String(group.gid);
    // 按钮可用性各归其主：historyOpen/analysisOpen 由各自模块的 setGroup 启用，
    // 附件入口由 composer 按「有选中群且未发送中」判定
    elements.emojiPickerOpen.disabled = false;
    composer.refreshAvailability();
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
    return sessions.open(group);
  }

  function updateCurrentGroupHeader() {
    const group = groups.findGroup(state.currentGid);
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
    void groups.refreshGroups(); void sessions.refresh(); login.maybeCheck();
  }

  async function initialize() {
    state.initializing = true; elements.retryGroups.hidden = true; elements.groupsState.textContent = "";
    try {
      const list = await groups.loadGroups();
      if (!list.length) return;
      const savedGid = Number(localStorage.getItem(LAST_GROUP_KEY));
      await selectGroup((list.find(group => group.gid === savedGid) || list[0]).gid);
    } catch (error) {
      if (error.status === 401) {
        login.showLoginExpired();
      } else {
        console.warn("加载群聊列表失败：", error);
        elements.groupsCount.textContent = "加载失败"; elements.groupsState.textContent = "群聊列表加载失败，请稍后重试。"; elements.retryGroups.hidden = false;
      }
    }
    finally { state.initializing = false; if (state.pendingRefresh) { state.pendingRefresh = false; refreshView(); } }
  }

  elements.retryGroups.addEventListener("click", initialize);
  window.addEventListener("focus", refreshView);
  window.addEventListener("blur", () => sessions.markAway());
  document.addEventListener("visibilitychange", () => { if (document.hidden) sessions.markAway(); else refreshView(); });
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
  initialize(); login.checkLoginStatus();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, {once: true});
else bootstrap();
