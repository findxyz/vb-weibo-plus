// 本地微博 post 页引导：收集 DOM 引用与共享状态，按依赖顺序装配各模块。
// 博主列表 → 日期时间轴 → 微博列表为数据流依赖链，跨模块编排走 datesApi/postsApi
// 的显式接口；图片查看器与登录相互独立，先建后注入。
import {createApiErrorHandler} from "./helpers.js";
import {createViewer} from "./viewer.js";
import {createPosts} from "./posts.js";
import {createDates} from "./dates.js";
import {createBloggers} from "./bloggers.js";
import {createSearch} from "./search.js";
import {createLogin} from "./login.js";

const elements = {
  globalTip: document.querySelector("#global-tip"),
  bloggersCount: document.querySelector("#bloggers-count"),
  bloggersList: document.querySelector("#bloggers-list"),
  bloggersState: document.querySelector("#bloggers-state"),
  bloggerSearch: document.querySelector("#blogger-search"),
  loginExpired: document.querySelector("#login-expired"),
  loginQr: document.querySelector("#login-qr"),
  loginQrImg: document.querySelector("#login-qr-img"),
  currentFilter: document.querySelector("#current-filter"),
  feedCount: document.querySelector("#feed-count"),
  datesState: document.querySelector("#dates-state"),
  datesList: document.querySelector("#dates-list"),
  posts: document.querySelector("#posts"),
  postsState: document.querySelector("#posts-state"),
  retryPosts: document.querySelector("#retry-posts"),
  imageViewer: document.querySelector("#image-viewer"),
  imageViewerState: document.querySelector("#image-viewer-state"),
  viewerPrev: document.querySelector(".viewer-prev"),
  viewerNext: document.querySelector(".viewer-next"),
  viewerCounter: document.querySelector("#viewer-counter"),
  windowToggle: document.querySelector(".window-control.toggle"),
  allBloggersRow: document.querySelector(".blogger-row.all-bloggers"),
  bloggerAdd: document.querySelector("#blogger-add"),
  addBloggerDialog: document.querySelector("#add-blogger"),
  addBloggerInput: document.querySelector("#add-blogger-input"),
  addBloggerError: document.querySelector("#add-blogger-error"),
  addBloggerCancel: document.querySelector("#add-blogger-cancel"),
  addBloggerSubmit: document.querySelector("#add-blogger-submit"),
  syncHistoryOpen: document.querySelector("#sync-history-open"),
  syncHistoryDialog: document.querySelector("#sync-history"),
  syncHistoryBlogger: document.querySelector("#sync-history-blogger"),
  syncHistoryStart: document.querySelector("#sync-history-start"),
  syncHistoryEnd: document.querySelector("#sync-history-end"),
  syncHistoryStatus: document.querySelector("#sync-history-status"),
  syncHistoryCancel: document.querySelector("#sync-history-cancel"),
  syncHistorySubmit: document.querySelector("#sync-history-submit"),
  searchOpen: document.querySelector("#search-open"),
  searchDialog: document.querySelector("#search-overlay"),
  searchScopeTip: document.querySelector("#search-scope-tip"),
  searchKeyword: document.querySelector("#search-keyword"),
  searchStart: document.querySelector("#search-start"),
  searchEnd: document.querySelector("#search-end"),
  searchStatus: document.querySelector("#search-status"),
  searchCancel: document.querySelector("#search-cancel"),
  searchSubmit: document.querySelector("#search-submit"),
  searchResults: document.querySelector("#search-results"),
};

const state = {
  bloggers: [],
  selectedUid: null,
  selectedDate: null,
  loadingPosts: false,
  viewerImages: [],
  viewerIndex: 0,
  searching: false,
};

// 各模块只收自己用到的元素句柄：按工厂签名里的名单挑子集，不再整包透传
const pickElements = (...keys) => Object.fromEntries(keys.map(key => [key, elements[key]]));

const login = createLogin({elements: pickElements("loginExpired", "loginQr", "loginQrImg", "bloggersState")});
const handleApiError = createApiErrorHandler(() => login.showLoginExpired());

const viewer = createViewer({
  elements: pickElements("imageViewer", "imageViewerState", "viewerPrev", "viewerNext", "viewerCounter"),
  state
});

const posts = createPosts({
  elements: pickElements("posts", "postsState", "feedCount", "retryPosts", "datesList"),
  state, handleApiError,
  openImageViewer: viewer.openImageViewer
});

const dates = createDates({
  elements: pickElements("datesState", "datesList"),
  state, handleApiError,
  onSelectDate: posts.selectDate
});

const bloggers = createBloggers({
  elements: pickElements(
    "bloggersCount", "bloggersList", "bloggersState", "allBloggersRow", "bloggerSearch",
    "currentFilter", "syncHistoryOpen", "globalTip",
    "bloggerAdd", "addBloggerDialog", "addBloggerCancel", "addBloggerSubmit", "addBloggerInput",
    "addBloggerError", "syncHistoryDialog", "syncHistoryBlogger", "syncHistoryStart",
    "syncHistoryEnd", "syncHistoryStatus", "syncHistoryCancel", "syncHistorySubmit"),
  state, handleApiError,
  datesApi: dates, postsApi: posts
});

createSearch({
  elements: pickElements(
    "searchOpen", "searchDialog", "searchCancel", "searchSubmit", "searchKeyword",
    "searchStart", "searchEnd", "searchStatus", "searchResults", "searchScopeTip"),
  state, handleApiError,
  datesApi: dates, postsApi: posts
});

elements.windowToggle.addEventListener("click", () => {
  location.href = "/chat/index.html";
});

login.checkLoginStatus();
bloggers.loadBloggers();
