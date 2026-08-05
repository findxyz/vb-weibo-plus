(() => {
  "use strict";

  const PAGE_SIZE = 20;
  const LAST_BLOGGER_KEY = "weibo-page:last-uid";
  const elements = {
    bloggersCount: document.querySelector("#bloggers-count"),
    bloggersList: document.querySelector("#bloggers-list"),
    bloggersState: document.querySelector("#bloggers-state"),
    bloggerSearch: document.querySelector("#blogger-search"),
    loginExpired: document.querySelector("#login-expired"),
    loginQr: document.querySelector("#login-qr"),
    currentFilter: document.querySelector("#current-filter"),
    feedCount: document.querySelector("#feed-count"),
    feedFilters: document.querySelector("#feed-filters"),
    filterStart: document.querySelector("#filter-start"),
    filterEnd: document.querySelector("#filter-end"),
    filterKeyword: document.querySelector("#filter-keyword"),
    filterReset: document.querySelector("#filter-reset"),
    posts: document.querySelector("#posts"),
    postsState: document.querySelector("#posts-state"),
    retryPosts: document.querySelector("#retry-posts"),
    pagination: document.querySelector("#pagination"),
    pagePrev: document.querySelector("#page-prev"),
    pageInfo: document.querySelector("#page-info"),
    pageNext: document.querySelector("#page-next"),
    imageViewer: document.querySelector("#image-viewer"),
    imageViewerState: document.querySelector("#image-viewer-state"),
    windowToggle: document.querySelector(".window-control.toggle"),
  };

  const state = {
    bloggers: [],
    selectedUid: null,
    page: 1,
    total: 0,
    loading: false,
  };

  /* ---------- 工具函数 ---------- */

  function formatDate(epochMillis) {
    if (!epochMillis) return "";
    const d = new Date(epochMillis);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function localDateValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
      restoreSelectedBlogger();
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
    elements.bloggersList.innerHTML = "";
    for (const blogger of list) {
      const row = createBloggerRow(blogger);
      elements.bloggersList.appendChild(row);
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

  function selectBlogger(blogger) {
    state.selectedUid = blogger.uid;
    localStorage.setItem(LAST_BLOGGER_KEY, String(blogger.uid));
    for (const row of elements.bloggersList.children) {
      row.classList.toggle("active", row.dataset.uid === String(blogger.uid));
    }
    elements.currentFilter.textContent = `${blogger.screenName} 的微博`;
    state.page = 1;
    loadPosts();
  }

  function restoreSelectedBlogger() {
    const savedUid = Number(localStorage.getItem(LAST_BLOGGER_KEY));
    if (savedUid) {
      const blogger = state.bloggers.find((b) => b.uid === savedUid);
      if (blogger) {
        selectBlogger(blogger);
        return;
      }
    }
    if (state.bloggers.length > 0) {
      selectBlogger(state.bloggers[0]);
    } else {
      showState(elements.postsState, "暂无博主数据");
    }
  }

  function filterBloggers() {
    const keyword = elements.bloggerSearch.value.trim().toLowerCase();
    for (const row of elements.bloggersList.children) {
      const name = (row.dataset.name || "").toLowerCase();
      row.hidden = keyword && !name.includes(keyword);
    }
  }

  /* ---------- 微博列表 ---------- */

  async function loadPosts() {
    if (state.loading) return;
    state.loading = true;
    showState(elements.postsState, "正在加载…");
    elements.retryPosts.hidden = true;
    elements.pagination.hidden = true;
    elements.posts.innerHTML = "";

    const params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("size", String(PAGE_SIZE));
    if (state.selectedUid) {
      params.set("uids", String(state.selectedUid));
    }
    const start = toQueryDateTime(elements.filterStart.value);
    const end = toQueryEndTime(elements.filterEnd.value);
    const keyword = elements.filterKeyword.value.trim();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (keyword) params.set("keyword", keyword);

    try {
      const result = await fetchJson(`/post/list?${params}`);
      state.total = result.total;
      renderPosts(result.items);
      updatePagination();
      if (result.items.length === 0) {
        showState(elements.postsState, "没有匹配的微博");
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
      state.loading = false;
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

  function createPostCard(post) {
    const card = document.createElement("article");
    card.className = "post-card";

    const avatar = createAvatar(post.blogger);
    card.appendChild(avatar);

    const body = document.createElement("div");
    body.className = "post-body";

    body.appendChild(createPostHeader(post));
    body.appendChild(createPostContent(post));

    if (post.pics && post.pics.length > 0) {
      body.appendChild(createPostPics(post.pics, post.mblogId));
    }

    if (post.video && post.video.coverUrl) {
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
    // 为其中已有的链接补充新窗口打开属性
    return html.replace(/<a\s/g, '<a target="_blank" rel="noopener" ');
  }

  function createPostPics(pics, mblogId) {
    const container = document.createElement("div");
    container.className = "post-pics" + (pics.length === 1 ? " one-image" : "");
    for (const pic of pics) {
      if (!pic.thumbnailUrl) continue;
      const picEl = document.createElement("a");
      picEl.className = "post-pic";
      picEl.href = pic.originalUrl || pic.thumbnailUrl;
      picEl.dataset.mblogId = mblogId;
      const img = document.createElement("img");
      img.src = pic.thumbnailUrl;
      img.alt = "微博图片";
      img.loading = "lazy";
      picEl.appendChild(img);
      picEl.addEventListener("click", (e) => {
        e.preventDefault();
        openImageViewer(pic.originalUrl || pic.thumbnailUrl);
      });
      container.appendChild(picEl);
    }
    return container;
  }

  function createPostVideo(video) {
    const wrapper = document.createElement("a");
    wrapper.className = "post-video";
    wrapper.href = video.pageUrl || "#";
    wrapper.target = "_blank";
    wrapper.rel = "noopener";

    const img = document.createElement("img");
    img.src = video.coverUrl;
    img.alt = "视频封面";
    img.loading = "lazy";
    wrapper.appendChild(img);

    if (video.pageUrl) {
      const play = document.createElement("span");
      play.className = "post-video-play";
      play.innerHTML = '<span>▶</span>';
      wrapper.appendChild(play);
    }

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
      const pics = document.createElement("div");
      pics.className = "post-retweet-pics";
      for (const pic of retweet.pics) {
        if (!pic.thumbnailUrl) continue;
        const picEl = document.createElement("a");
        picEl.className = "post-retweet-pic";
        picEl.href = pic.originalUrl || pic.thumbnailUrl;
        const img = document.createElement("img");
        img.src = pic.thumbnailUrl;
        img.alt = "转发微博图片";
        img.loading = "lazy";
        picEl.appendChild(img);
        picEl.addEventListener("click", (e) => {
          e.preventDefault();
          openImageViewer(pic.originalUrl || pic.thumbnailUrl);
        });
        pics.appendChild(picEl);
      }
      block.appendChild(pics);
    }

    return block;
  }

  function createPostActions(post) {
    const actions = document.createElement("div");
    actions.className = "post-actions";

    const reposts = document.createElement("span");
    reposts.className = "post-action";
    reposts.innerHTML = '<span class="post-action-icon">🔁</span>';
    reposts.append(` ${post.repostsCount || 0}`);

    const comments = document.createElement("span");
    comments.className = "post-action";
    comments.innerHTML = '<span class="post-action-icon">💬</span>';
    comments.append(` ${post.commentsCount || 0}`);

    const attitudes = document.createElement("span");
    attitudes.className = "post-action";
    attitudes.innerHTML = '<span class="post-action-icon">❤</span>';
    attitudes.append(` ${post.attitudesCount || 0}`);

    const link = document.createElement("a");
    link.className = "post-link";
    link.href = post.postUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "查看原文";

    actions.appendChild(reposts);
    actions.appendChild(comments);
    actions.appendChild(attitudes);
    actions.appendChild(link);
    return actions;
  }

  /* ---------- 分页 ---------- */

  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (totalPages <= 1) {
      elements.pagination.hidden = true;
      return;
    }
    elements.pagination.hidden = false;
    elements.pageInfo.textContent = `第 ${state.page} / ${totalPages} 页（共 ${state.total} 条）`;
    elements.pagePrev.disabled = state.page <= 1;
    elements.pageNext.disabled = state.page >= totalPages;
    elements.feedCount.textContent = `共 ${state.total} 条`;
  }

  /* ---------- 图片查看器 ---------- */

  function openImageViewer(url) {
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
    if (!dialog.open) dialog.showModal();
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

  elements.bloggerSearch.addEventListener("input", filterBloggers);

  elements.feedFilters.addEventListener("submit", (e) => {
    e.preventDefault();
    state.page = 1;
    loadPosts();
  });

  elements.filterReset.addEventListener("click", () => {
    elements.filterStart.value = "";
    elements.filterEnd.value = "";
    elements.filterKeyword.value = "";
    state.page = 1;
    loadPosts();
  });

  elements.retryPosts.addEventListener("click", loadPosts);

  elements.pagePrev.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadPosts();
    }
  });

  elements.pageNext.addEventListener("click", () => {
    const totalPages = Math.ceil(state.total / PAGE_SIZE);
    if (state.page < totalPages) {
      state.page++;
      loadPosts();
    }
  });

  elements.windowToggle.addEventListener("click", () => {
    location.href = "/chat/";
  });

  elements.loginQr.addEventListener("click", startQrLogin);

  elements.imageViewer.addEventListener("click", (e) => {
    if (e.target === elements.imageViewer || e.target.tagName === "IMG") {
      closeImageViewer();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.imageViewer.open) {
      closeImageViewer();
    }
  });

  /* ---------- 初始化 ---------- */

  function init() {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    elements.filterEnd.value = localDateValue(today);
    elements.filterStart.value = localDateValue(monthAgo);

    checkLoginStatus();
    loadBloggers();
  }

  init();
})();
