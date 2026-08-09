(() => {
  "use strict";

  const DAY_PAGE_SIZE = 9999;
  const QR_IMAGE_INTERVAL = 10000;
  const QR_LOGIN_LOADING_TEXT = "扫码中…";
  const elements = {
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

  /* ---------- 工具函数 ---------- */

  function formatDate(epochMillis) {
    if (!epochMillis) return "";
    const d = new Date(epochMillis);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toQueryDateTime(dateStr) {
    if (!dateStr) return null;
    return `${dateStr} 00:00:00`;
  }

  function toQueryEndTime(dateStr) {
    if (!dateStr) return null;
    return `${dateStr} 23:59:59`;
  }

  // date 输入框需要的本地日期格式（YYYY-MM-DD）
  function toLocalDateValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body.msg) msg = body.msg;
      } catch (_) {
        // 非 JSON 错误体，用默认消息
      }
      const error = new Error(msg);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function showState(el, message) {
    el.textContent = message || "";
  }

  /* ---------- 博主列表 ---------- */

  async function loadBloggers(selectAll = true) {
    showState(elements.bloggersState, "");
    elements.bloggersCount.textContent = "正在加载…";
    try {
      const list = await fetchJson("/post/bloggers");
      state.bloggers = list;
      renderBloggers(list);
      elements.bloggersCount.textContent = `${list.length} 位博主`;
      if (selectAll) {
        selectAllBloggers();
      }
    } catch (error) {
      if (error.status === 401) {
        showLoginExpired();
      } else {
        showState(elements.bloggersState, `加载失败：${error.message}`);
      }
      elements.bloggersCount.textContent = "加载失败";
    }
  }

  function renderBloggers(list) {
    // 保留顶部的「全部博主」行，只重建其后的博主行
    for (const row of elements.bloggersList.querySelectorAll(".blogger-row:not(.all-bloggers)")) {
      row.remove();
    }
    for (const blogger of list) {
      elements.bloggersList.appendChild(createBloggerRow(blogger));
    }
  }

  function createBloggerRow(blogger) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "blogger-row";
    row.dataset.uid = String(blogger.uid);
    row.dataset.name = blogger.screenName;

    const avatar = document.createElement("span");
    avatar.className = "blogger-avatar";
    if (blogger.avatar) {
      const img = document.createElement("img");
      img.src = blogger.avatar;
      img.alt = "";
      img.loading = "lazy";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (blogger.screenName || "?").charAt(0);
    }

    const info = document.createElement("div");
    info.className = "blogger-info";

    const name = document.createElement("div");
    name.className = "blogger-name";
    name.textContent = blogger.screenName;
    if (blogger.verified) {
      const badge = document.createElement("span");
      badge.className = "verified-badge";
      badge.setAttribute("aria-label", "认证用户");
      name.appendChild(badge);
    }

    info.appendChild(name);
    row.appendChild(avatar);
    row.appendChild(info);

    row.addEventListener("click", () => selectBlogger(blogger));
    return row;
  }

  function selectAllBloggers() {
    state.selectedUid = null;
    setActiveBloggerRow(elements.allBloggersRow);
    elements.currentFilter.textContent = "全部微博";
    elements.syncHistoryOpen.hidden = true;
    onBloggerChanged();
  }

  function selectBlogger(blogger) {
    state.selectedUid = blogger.uid;
    const row = elements.bloggersList.querySelector(
      `.blogger-row:not(.all-bloggers)[data-uid="${blogger.uid}"]`);
    setActiveBloggerRow(row);
    elements.currentFilter.textContent = `${blogger.screenName} 的微博`;
    elements.syncHistoryOpen.hidden = false;
    onBloggerChanged();
  }

  function setActiveBloggerRow(row) {
    for (const r of elements.bloggersList.querySelectorAll(".blogger-row")) {
      r.classList.toggle("active", r === row);
    }
  }

  async function onBloggerChanged() {
    state.selectedDate = null;
    elements.posts.innerHTML = "";
    showState(elements.postsState, "");
    elements.feedCount.textContent = "";
    await loadDates();
      const firstMonth = elements.datesList.querySelector(".month-group");
      if (firstMonth) {
        toggleMonth(firstMonth);
      const firstDay = firstMonth.querySelector(".date-item");
      if (firstDay) {
        selectDate(firstDay.dataset.date, firstDay);
      } else {
        showState(elements.postsState, "该月无微博");
      }
    } else {
      showState(elements.postsState, "无微博数据");
    }
  }

  function filterBloggers() {
    const keyword = elements.bloggerSearch.value.trim().toLowerCase();
    for (const row of elements.bloggersList.querySelectorAll(".blogger-row:not(.all-bloggers)")) {
      const name = (row.dataset.name || "").toLowerCase();
      row.hidden = keyword && !name.includes(keyword);
    }
  }

  /* ---------- 添加博主 ---------- */

  // 支持纯 UID、weibo.com/u/xxx、weibo.com/xxx 三种输入，返回 uid 字符串
  function parseBloggerUid(input) {
    const value = input.trim();
    if (/^\d{4,}$/.test(value)) {
      return value;
    }
    const match = value.match(/weibo\.com\/(?:u\/)?(\d{4,})/);
    return match ? match[1] : null;
  }

  function openAddBloggerDialog() {
    elements.addBloggerInput.value = "";
    showState(elements.addBloggerError, "");
    elements.addBloggerSubmit.disabled = false;
    elements.addBloggerDialog.showModal();
    elements.addBloggerInput.focus();
  }

  async function submitAddBlogger() {
    if (elements.addBloggerSubmit.disabled) {
      return;
    }
    const uid = parseBloggerUid(elements.addBloggerInput.value);
    if (!uid) {
      showState(elements.addBloggerError,
        "无法识别，请输入 UID 或 weibo.com/u/ 开头的主页链接。");
      return;
    }
    elements.addBloggerSubmit.disabled = true;
    showState(elements.addBloggerError, "正在添加并拉取微博…");
    try {
      await fetchJson(`/post/bloggers?uid=${uid}`, {method: "POST"});
      elements.addBloggerDialog.close();
      await reloadBloggersAndSelect(Number(uid));
    } catch (error) {
      if (error.status === 401) {
        elements.addBloggerDialog.close();
        showLoginExpired();
      } else {
        showState(elements.addBloggerError, `添加失败：${error.message}`);
      }
    } finally {
      elements.addBloggerSubmit.disabled = false;
    }
  }

  async function reloadBloggersAndSelect(uid) {
    // 跳过 loadBloggers 默认的「全部博主」选中，避免与新博主的选中产生竞态
    await loadBloggers(false);
    const blogger = state.bloggers.find((b) => Number(b.uid) === uid);
    if (blogger) {
      selectBlogger(blogger);
    }
  }

  /* ---------- 同步历史微博 ---------- */

  function openSyncHistoryDialog() {
    const blogger = state.bloggers.find(
      (b) => Number(b.uid) === Number(state.selectedUid));
    if (!blogger) return;
    elements.syncHistoryBlogger.textContent = `@${blogger.screenName}`;
    // 与群聊页保持一致：默认同步最近两年到今天
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    elements.syncHistoryStart.value = toLocalDateValue(start);
    elements.syncHistoryEnd.value = toLocalDateValue(end);
    showSyncHistoryStatus("", false);
    elements.syncHistorySubmit.disabled = false;
    elements.syncHistoryDialog.showModal();
  }

  function showSyncHistoryStatus(message, ok) {
    elements.syncHistoryStatus.textContent = message || "";
    elements.syncHistoryStatus.classList.toggle("ok", Boolean(ok));
  }

  function submitSyncHistory() {
    const start = elements.syncHistoryStart.value;
    const end = elements.syncHistoryEnd.value;
    if (!start || !end) {
      showSyncHistoryStatus("请选择开始与结束日期。", false);
      return;
    }
    if (start > end) {
      showSyncHistoryStatus("开始日期不能晚于结束日期。", false);
      return;
    }
    // 同步在服务端执行，发起后立即关闭弹窗，由后台任务接管
    elements.syncHistoryDialog.close();
    runSyncHistory(Number(state.selectedUid), start, end);
  }

  async function runSyncHistory(uid, start, end) {
    elements.syncHistoryOpen.disabled = true;
    const params = new URLSearchParams({
      uid: String(uid),
      start: `${start} 00:00:00`,
      end: `${end} 23:59:59`,
    });
    try {
      const result = await fetchJson(`/post/range?${params}`, {method: "POST"});
      // 刷新日期时间轴，让新同步的日期出现在面板里
      await loadDates();
      showState(elements.datesState, "同步完成");
    } catch (error) {
      if (error.status === 401) {
        showLoginExpired();
      } else {
        showState(elements.datesState, `同步失败：${error.message}`);
      }
    } finally {
      elements.syncHistoryOpen.disabled = false;
    }
  }

  /* ---------- 高级搜索 ---------- */

  const SEARCH_SIZE_LIMIT = 1000;

  function currentScopeLabel() {
    if (!state.selectedUid) return "全部博主";
    const blogger = state.bloggers.find((b) => Number(b.uid) === Number(state.selectedUid));
    return blogger ? `@${blogger.screenName}` : "当前博主";
  }

  function openSearchDialog() {
    elements.searchScopeTip.textContent = `在「${currentScopeLabel()}」范围内搜索。`;
    elements.searchKeyword.value = "";
    // 首次打开填默认起止：起 2010-01-01 至今
    elements.searchStart.value = "2010-01-01";
    elements.searchEnd.value = toLocalDateValue(new Date());
    showState(elements.searchStatus, "");
    elements.searchResults.innerHTML = "";
    elements.searchSubmit.disabled = false;
    elements.searchDialog.showModal();
    elements.searchKeyword.focus();
  }

  async function submitSearch() {
    if (state.searching) return;
    const keyword = elements.searchKeyword.value.trim();
    if (!keyword) {
      showState(elements.searchStatus, "请输入关键词。");
      return;
    }
    const start = elements.searchStart.value;
    const end = elements.searchEnd.value;
    if (start && end && start > end) {
      showState(elements.searchStatus, "开始日期不能晚于结束日期。");
      return;
    }
    state.searching = true;
    elements.searchSubmit.disabled = true;
    showState(elements.searchStatus, "搜索中…");
    elements.searchResults.innerHTML = "";

    const params = new URLSearchParams();
    params.set("keyword", keyword);
    params.set("page", "1");
    params.set("size", String(SEARCH_SIZE_LIMIT));
    if (state.selectedUid) {
      params.set("uids", String(state.selectedUid));
    }
    if (start) params.set("start", `${start} 00:00:00`);
    if (end) params.set("end", `${end} 23:59:59`);

    try {
      const result = await fetchJson(`/post/list?${params}`);
      renderSearchResults(result, keyword);
    } catch (error) {
      if (error.status === 401) {
        elements.searchDialog.close();
        showLoginExpired();
      } else {
        showState(elements.searchStatus, `搜索失败：${error.message}`);
      }
    } finally {
      state.searching = false;
      elements.searchSubmit.disabled = false;
    }
  }

  function renderSearchResults(result, keyword) {
    elements.searchResults.innerHTML = "";
    if (!result.items || result.items.length === 0) {
      showState(elements.searchStatus, "");
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "未找到匹配微博";
      elements.searchResults.appendChild(empty);
      return;
    }
    if (result.total > SEARCH_SIZE_LIMIT) {
      showState(elements.searchStatus, `已达上限（${result.total} 条），请缩小范围`);
    } else {
      showState(elements.searchStatus, `找到 ${result.total} 条结果`);
    }
    for (const post of result.items) {
      elements.searchResults.appendChild(createSearchResultItem(post, keyword));
    }
  }

  // 在正文纯文本里找命中词位置，截取前后文并用 <mark> 包裹
  function buildSnippet(post, keyword) {
    const text = (post.contentRaw || stripHtml(post.content || "")).trim();
    if (!text) return "";
    const lower = text.toLowerCase();
    const idx = lower.indexOf(keyword.toLowerCase());
    if (idx < 0) return escapeHtml(text.slice(0, 80));
    const radius = 30;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + keyword.length + radius);
    const prefix = (start > 0 ? "…" : "") + text.slice(start, idx);
    const match = text.slice(idx, idx + keyword.length);
    const suffix = text.slice(idx + keyword.length, end) + (end < text.length ? "…" : "");
    return escapeHtml(prefix) + `<mark>${escapeHtml(match)}</mark>` + escapeHtml(suffix);
  }

  function stripHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function createSearchResultItem(post, keyword) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-result";

    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    const dateText = formatDate(post.createdAt);
    const author = post.blogger ? post.blogger.screenName : "未知博主";
    meta.textContent = `${dateText} · ${author}`;

    const snippet = document.createElement("div");
    snippet.className = "search-result-snippet";
    snippet.innerHTML = buildSnippet(post, keyword);

    item.appendChild(meta);
    item.appendChild(snippet);
    item.addEventListener("click", () => jumpToPost(post));
    return item;
  }

  async function jumpToPost(post) {
    elements.searchDialog.close();
    const dateStr = epochToDateStr(post.createdAt);
    // 选中日期树对应日（必要时先展开月份）
    const monthKey = dateStr.slice(0, 7);
    const monthGroup = elements.datesList.querySelector(`.month-group[data-month="${monthKey}"]`);
    if (monthGroup && !monthGroup.classList.contains("open")) {
      toggleMonth(monthGroup);
    }
    const dayItem = elements.datesList.querySelector(`.date-item[data-date="${dateStr}"]`);
    if (dayItem) {
      // 直接走 loadPosts，避免 selectDate 的 loadingPosts 早退保护
      for (const el of elements.datesList.querySelectorAll(".date-item.active")) {
        el.classList.remove("active");
      }
      dayItem.classList.add("active");
      state.selectedDate = dateStr;
    }
    await loadPosts(dateStr);
    requestAnimationFrame(() => {
      const card = document.querySelector(`#post-${post.mblogId}`);
      if (card) {
        card.scrollIntoView({behavior: "smooth", block: "center"});
        card.classList.add("flash-highlight");
        setTimeout(() => card.classList.remove("flash-highlight"), 1600);
      }
    });
  }

  // 与后端 Asia/Shanghai 时区保持一致，避免本地时区导致日期错位
  function epochToDateStr(epochMillis) {
    const d = new Date(epochMillis + 8 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  /* ---------- 日期时间轴 ---------- */

  async function loadDates() {
    showState(elements.datesState, "加载中…");
    elements.datesList.innerHTML = "";
    const params = new URLSearchParams();
    if (state.selectedUid) {
      params.set("uid", String(state.selectedUid));
    }
    try {
      const result = await fetchJson(`/post/calendar?${params}`);
      renderDates(result.months);
      showState(elements.datesState, result.months.length ? "" : "无数据");
    } catch (error) {
      if (error.status === 401) {
        showLoginExpired();
      }
      showState(elements.datesState, "加载失败");
    }
  }

  function renderDates(months) {
    elements.datesList.innerHTML = "";
    for (const month of months) {
      const group = document.createElement("div");
      group.className = "month-group";
      group.dataset.month = month.month;

      const header = document.createElement("div");
      header.className = "month-header";
      header.textContent = month.month;
      const count = document.createElement("span");
      count.className = "month-count";
      count.textContent = `${month.count} 条`;
      header.appendChild(count);
      header.addEventListener("click", () => toggleMonth(group));
      group.appendChild(header);

      const days = document.createElement("div");
      days.className = "month-days";
      for (const day of month.days) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "date-item";
        item.dataset.date = day.date;
        const label = document.createElement("span");
        label.textContent = day.date.slice(5);
        const dayCount = document.createElement("span");
        dayCount.className = "date-count";
        dayCount.textContent = day.count;
        item.appendChild(label);
        item.appendChild(dayCount);
        item.addEventListener("click", () => selectDate(day.date, item));
        days.appendChild(item);
      }
      group.appendChild(days);
      elements.datesList.appendChild(group);
    }
  }

  function toggleMonth(group) {
    group.classList.toggle("open");
  }

  /* ---------- 微博列表（按日加载） ---------- */

  async function selectDate(date, itemEl) {
    if (state.loadingPosts) return;
    for (const el of elements.datesList.querySelectorAll(".date-item.active")) {
      el.classList.remove("active");
    }
    if (itemEl) itemEl.classList.add("active");
    state.selectedDate = date;
    await loadPosts(date);
  }

  async function loadPosts(date) {
    state.loadingPosts = true;
    showState(elements.postsState, "正在加载…");
    elements.retryPosts.hidden = true;
    elements.posts.innerHTML = "";

    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("size", String(DAY_PAGE_SIZE));
    if (state.selectedUid) {
      params.set("uids", String(state.selectedUid));
    }
    const start = toQueryDateTime(date);
    const end = toQueryEndTime(date);
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    try {
      const result = await fetchJson(`/post/list?${params}`);
      renderPosts(result.items);
      elements.feedCount.textContent = `共 ${result.total} 条`;
      if (result.items.length === 0) {
        showState(elements.postsState, "该日无微博");
      } else {
        showState(elements.postsState, "");
      }
    } catch (error) {
      if (error.status === 401) {
        showLoginExpired();
      } else {
        showState(elements.postsState, `加载失败：${error.message}`);
        elements.retryPosts.hidden = false;
      }
    } finally {
      state.loadingPosts = false;
    }
  }

  function renderPosts(items) {
    elements.posts.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const post of items) {
      fragment.appendChild(createPostCard(post));
    }
    elements.posts.appendChild(fragment);
  }

  // 只有同时拿到视频页地址和封面图，才展示视频卡片
  function hasPlayableVideo(video) {
    return Boolean(video && video.pageUrl && video.coverUrl);
  }

  function createPostCard(post) {
    const isPureRetweet = !post.content
      && (!post.pics || post.pics.length === 0)
      && !hasPlayableVideo(post.video)
      && post.retweeted;

    const card = document.createElement("article");
    card.className = "post-card" + (isPureRetweet ? " pure-retweet" : "");
    card.id = "post-" + post.mblogId;

    if (!isPureRetweet) {
      card.appendChild(createAvatar(post.blogger));
    }

    const body = document.createElement("div");
    body.className = "post-body";

    body.appendChild(createPostHeader(post));
    if (post.content) {
      body.appendChild(createPostContent(post));
    }

    if (post.pics && post.pics.length > 0) {
      body.appendChild(createPostPics(post.pics, post.mblogId));
    }

    // 外层视频与转发视频指向同一地址时，只保留转发中的那个
    const retweetVideo = post.retweeted && hasPlayableVideo(post.retweeted.video)
      ? post.retweeted.video
      : null;
    const hideOuterVideo = hasPlayableVideo(post.video)
      && retweetVideo
      && post.video.pageUrl === retweetVideo.pageUrl;
    if (hasPlayableVideo(post.video) && !hideOuterVideo) {
      body.appendChild(createPostVideo(post.video));
    }

    if (post.retweeted) {
      body.appendChild(createRetweetBlock(post.retweeted, post.mblogId));
    }

    body.appendChild(createPostActions(post));

    card.appendChild(body);
    return card;
  }

  function createAvatar(blogger) {
    const avatar = document.createElement("span");
    avatar.className = "post-avatar";
    if (blogger && blogger.avatar) {
      const img = document.createElement("img");
      img.src = blogger.avatar;
      img.alt = "";
      img.loading = "lazy";
      avatar.appendChild(img);
    } else if (blogger) {
      avatar.textContent = (blogger.screenName || "?").charAt(0);
    }
    return avatar;
  }

  function createPostHeader(post) {
    const header = document.createElement("div");
    header.className = "post-header";

    const author = document.createElement("span");
    author.className = "post-author";
    author.textContent = post.blogger ? post.blogger.screenName : "未知博主";
    if (post.blogger && post.blogger.verified) {
      const badge = document.createElement("span");
      badge.className = "verified-badge";
      badge.setAttribute("aria-label", "认证用户");
      author.appendChild(badge);
    }

    const time = document.createElement("span");
    time.className = "post-time";
    time.textContent = formatDate(post.createdAt);

    const region = document.createElement("span");
    region.className = "post-region";
    region.textContent = post.region || "";

    const source = document.createElement("span");
    source.className = "post-source";
    source.textContent = post.source || "";

    header.appendChild(author);
    header.appendChild(time);
    header.appendChild(region);
    header.appendChild(source);
    return header;
  }

  function createPostContent(post) {
    const content = document.createElement("div");
    content.className = "post-content";
    content.innerHTML = renderContent(post.content);
    return content;
  }

  function renderContent(html) {
    if (!html) return "";
    // content 字段是微博富文本 HTML，已是后端处理后的安全内容；
    // 这里统一修正链接：相对地址（如 @ 用户的 /n/xxx）补全为微博域名，
    // 协议相对地址补全 https，并让所有链接在新窗口打开
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const a of doc.querySelectorAll("a")) {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("//")) {
        a.setAttribute("href", "https:" + href);
      } else if (href.startsWith("/")) {
        a.setAttribute("href", "https://weibo.com" + href);
      }
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    }
    return doc.body.innerHTML;
  }

  function createPostPics(pics, mblogId) {
    const container = document.createElement("div");
    container.className = "post-pics" + (pics.length === 1 ? " one-image" : "");
    const validPics = pics.filter((p) => p.thumbnailUrl || p.originalUrl);
    validPics.forEach((pic, index) => {
      const picEl = document.createElement("a");
      picEl.className = "post-pic";
      picEl.href = pic.originalUrl || pic.thumbnailUrl;
      picEl.dataset.mblogId = mblogId;
      const img = document.createElement("img");
      img.src = pic.originalUrl || pic.thumbnailUrl;
      img.alt = "微博图片";
      img.loading = "lazy";
      const width = pic.originalWidth || pic.thumbnailWidth;
      const height = pic.originalHeight || pic.thumbnailHeight;
      if (width > 0 && height > 0) {
        img.width = width;
        img.height = height;
      }
      // 加载失败时隐藏整个格子，避免碎图图标与 alt 文字
      img.onerror = () => { picEl.hidden = true; };
      picEl.appendChild(img);
      picEl.addEventListener("click", (e) => {
        e.preventDefault();
        openImageViewer(validPics, index);
      });
      container.appendChild(picEl);
    });
    return container;
  }

  function createPostVideo(video) {
    const wrapper = document.createElement("a");
    wrapper.className = "post-video";
    wrapper.href = video.pageUrl;
    wrapper.target = "_blank";
    wrapper.rel = "noopener";

    const img = document.createElement("img");
    img.src = video.coverUrl;
    img.alt = "视频封面";
    img.loading = "lazy";
    // 封面加载失败时只隐藏图片，保留可点击的播放占位
    img.onerror = () => { img.hidden = true; };
    wrapper.appendChild(img);

    // 三角形用 CSS 绘制，避免 ▶ 字符在不同字体下偏移
    const play = document.createElement("span");
    play.className = "post-video-play";
    play.appendChild(document.createElement("span"));
    wrapper.appendChild(play);

    return wrapper;
  }

  function createRetweetBlock(retweet, mblogId) {
    const block = document.createElement("div");
    block.className = "post-retweet";

    const author = document.createElement("div");
    author.className = "post-retweet-author";
    author.textContent = `@${retweet.screenName || "未知用户"}`;

    const content = document.createElement("div");
    content.className = "post-retweet-content";
    content.innerHTML = renderContent(retweet.content);

    block.appendChild(author);
    block.appendChild(content);

    if (retweet.pics && retweet.pics.length > 0) {
      const validRetweetPics = retweet.pics.filter((p) => p.thumbnailUrl || p.originalUrl);
      if (validRetweetPics.length > 0) {
        const pics = document.createElement("div");
        pics.className = "post-retweet-pics";
        validRetweetPics.forEach((pic, index) => {
          const picEl = document.createElement("a");
          picEl.className = "post-retweet-pic";
          picEl.href = "javascript:void(0)";
          const img = document.createElement("img");
          img.src = pic.originalUrl || pic.thumbnailUrl;
          img.alt = "转发微博图片";
          img.loading = "lazy";
          // 加载失败时隐藏整个格子，避免碎图图标与 alt 文字
          img.onerror = () => { picEl.hidden = true; };
          picEl.appendChild(img);
          picEl.addEventListener("click", (e) => {
            e.preventDefault();
            openImageViewer(validRetweetPics, index);
          });
          pics.appendChild(picEl);
        });
        block.appendChild(pics);
      }
    }

    if (hasPlayableVideo(retweet.video)) {
      block.appendChild(createPostVideo(retweet.video));
    }

    return block;
  }

  function createPostActions(post) {
    const actions = document.createElement("div");
    actions.className = "post-actions";

    const link = document.createElement("a");
    link.className = "post-link";
    link.href = post.postUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "查看原文";

    actions.appendChild(link);
    return actions;
  }

  /* ---------- 图片查看器 ---------- */

  function openImageViewer(pics, index) {
    if (!pics || pics.length === 0) return;
    state.viewerImages = pics.map((p) => p.originalUrl || p.thumbnailUrl).filter(Boolean);
    if (state.viewerImages.length === 0) return;
    state.viewerIndex = Math.max(0, Math.min(index, state.viewerImages.length - 1));
    showViewerImage(state.viewerIndex);
    if (!elements.imageViewer.open) elements.imageViewer.showModal();
  }

  function showViewerImage(index) {
    const url = state.viewerImages[index];
    if (!url) return;
    const dialog = elements.imageViewer;
    const img = dialog.querySelector("img");
    showState(elements.imageViewerState, "加载中…");
    img.hidden = true;
    img.onload = () => {
      img.hidden = false;
      showState(elements.imageViewerState, "");
    };
    img.onerror = () => {
      img.hidden = true;
      showState(elements.imageViewerState, "图片加载失败");
    };
    img.src = url;

    const hasMultiple = state.viewerImages.length > 1;
    elements.viewerPrev.hidden = !hasMultiple;
    elements.viewerNext.hidden = !hasMultiple;
    if (hasMultiple) {
      elements.viewerCounter.hidden = false;
      elements.viewerCounter.textContent = `${index + 1} / ${state.viewerImages.length}`;
    } else {
      elements.viewerCounter.hidden = true;
    }
  }

  function showPrevImage() {
    if (state.viewerImages.length <= 1) return;
    state.viewerIndex = (state.viewerIndex - 1 + state.viewerImages.length) % state.viewerImages.length;
    showViewerImage(state.viewerIndex);
  }

  function showNextImage() {
    if (state.viewerImages.length <= 1) return;
    state.viewerIndex = (state.viewerIndex + 1) % state.viewerImages.length;
    showViewerImage(state.viewerIndex);
  }

  function closeImageViewer() {
    if (elements.imageViewer.open) {
      elements.imageViewer.close();
    }
  }

  /* ---------- 登录状态 ---------- */

  let qrImageTimer = null;

  function refreshQrImage() {
    const img = new Image();
    img.onload = () => {
      elements.loginQrImg.src = img.src;
      elements.loginQrImg.hidden = false;
    };
    img.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }

  function startQrImagePolling() {
    qrImageTimer = setInterval(refreshQrImage, QR_IMAGE_INTERVAL);
    setTimeout(refreshQrImage, 3000);
  }

  function stopQrImagePolling() {
    if (qrImageTimer) {
      clearInterval(qrImageTimer);
      qrImageTimer = null;
    }
    elements.loginQrImg.hidden = true;
  }

  function showLoginExpired() {
    elements.loginExpired.hidden = false;
  }

  async function checkLoginStatus() {
    try {
      const result = await fetchJson("/weibo/login/status", {cache: "no-store"});
      if (!result.valid) {
        showLoginExpired();
      } else {
        elements.loginExpired.hidden = true;
      }
    } catch (_) {
      // 忽略登录检测失败
    }
  }

  async function startQrLogin() {
    elements.loginQr.disabled = true;
    elements.loginQr.textContent = QR_LOGIN_LOADING_TEXT;
    startQrImagePolling();
    try {
      await fetchJson("/weibo/login/qr", {method: "POST"});
      await checkLoginStatus();
    } catch (error) {
      showState(elements.bloggersState, `登录请求失败：${error.message}`);
    } finally {
      stopQrImagePolling();
      elements.loginQr.disabled = false;
      elements.loginQr.textContent = "扫码登录";
    }
  }

  /* ---------- 事件绑定 ---------- */

  elements.allBloggersRow.addEventListener("click", selectAllBloggers);
  elements.bloggerSearch.addEventListener("input", filterBloggers);

  elements.bloggerAdd.addEventListener("click", openAddBloggerDialog);
  elements.addBloggerCancel.addEventListener("click", () => {
    elements.addBloggerDialog.close();
  });
  elements.addBloggerSubmit.addEventListener("click", submitAddBlogger);
  elements.addBloggerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitAddBlogger();
    }
  });
  elements.retryPosts.addEventListener("click", () => {
    if (state.selectedDate) loadPosts(state.selectedDate);
  });

  elements.syncHistoryOpen.addEventListener("click", openSyncHistoryDialog);
  elements.syncHistoryCancel.addEventListener("click", () => {
    elements.syncHistoryDialog.close();
  });
  elements.syncHistorySubmit.addEventListener("click", submitSyncHistory);

  elements.searchOpen.addEventListener("click", openSearchDialog);
  elements.searchCancel.addEventListener("click", () => {
    elements.searchDialog.close();
  });
  elements.searchSubmit.addEventListener("click", submitSearch);
  elements.searchKeyword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitSearch();
    }
  });

  elements.windowToggle.addEventListener("click", () => {
    location.href = "/chat/index.html";
  });

  elements.loginQr.addEventListener("click", startQrLogin);

  elements.imageViewer.addEventListener("click", (e) => {
    if (e.target === elements.imageViewer) {
      closeImageViewer();
    }
  });

  elements.viewerPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    showPrevImage();
  });

  elements.viewerNext.addEventListener("click", (e) => {
    e.stopPropagation();
    showNextImage();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elements.imageViewer.open) {
        closeImageViewer();
      }
      // 搜索浮层由原生 dialog 处理 Esc，无需额外逻辑
    } else if (elements.imageViewer.open) {
      if (e.key === "ArrowLeft") {
        showPrevImage();
      } else if (e.key === "ArrowRight") {
        showNextImage();
      }
    }
  });

  /* ---------- 初始化 ---------- */

  function init() {
    checkLoginStatus();
    loadBloggers();
  }

  init();
})();
