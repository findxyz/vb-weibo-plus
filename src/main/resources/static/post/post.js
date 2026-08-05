(() => {
  "use strict";

  const DAY_PAGE_SIZE = 9999;
  const elements = {
    bloggersCount: document.querySelector("#bloggers-count"),
    bloggersList: document.querySelector("#bloggers-list"),
    bloggersState: document.querySelector("#bloggers-state"),
    bloggerSearch: document.querySelector("#blogger-search"),
    loginExpired: document.querySelector("#login-expired"),
    loginQr: document.querySelector("#login-qr"),
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
  };

  const state = {
    bloggers: [],
    selectedUid: null,
    selectedDate: null,
    loadingPosts: false,
    viewerImages: [],
    viewerIndex: 0,
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

  async function loadBloggers() {
    showState(elements.bloggersState, "");
    elements.bloggersCount.textContent = "正在加载…";
    try {
      const list = await fetchJson("/post/bloggers");
      state.bloggers = list;
      renderBloggers(list);
      elements.bloggersCount.textContent = `${list.length} 位博主`;
      selectAllBloggers();
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
    onBloggerChanged();
  }

  function selectBlogger(blogger) {
    state.selectedUid = blogger.uid;
    const row = elements.bloggersList.querySelector(
      `.blogger-row:not(.all-bloggers)[data-uid="${blogger.uid}"]`);
    setActiveBloggerRow(row);
    elements.currentFilter.textContent = `${blogger.screenName} 的微博`;
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
    // loadBloggers 默认选中「全部博主」，这里在它的基础上改选新添加的博主
    await loadBloggers();
    const blogger = state.bloggers.find((b) => Number(b.uid) === uid);
    if (blogger) {
      selectBlogger(blogger);
    }
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
    try {
      await fetchJson("/weibo/login/qr", {method: "POST"});
      await checkLoginStatus();
    } catch (error) {
      showState(elements.bloggersState, `登录请求失败：${error.message}`);
    } finally {
      elements.loginQr.disabled = false;
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
    if (!elements.imageViewer.open) return;
    if (e.key === "Escape") {
      closeImageViewer();
    } else if (e.key === "ArrowLeft") {
      showPrevImage();
    } else if (e.key === "ArrowRight") {
      showNextImage();
    }
  });

  /* ---------- 初始化 ---------- */

  function init() {
    checkLoginStatus();
    loadBloggers();
  }

  init();
})();
