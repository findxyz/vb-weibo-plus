(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const FIRST_PAGE = 1;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
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
    currentNotice: document.querySelector("#current-notice"),
    currentAvatar: document.querySelector("#current-group-avatar"),
    messages: document.querySelector("#messages"),
    messagesState: document.querySelector("#messages-state"),
    retryMessages: document.querySelector("#retry-messages"),
    loadEarlier: document.querySelector("#load-earlier"),
    newMessages: document.querySelector("#new-messages"),
    imageViewer: document.querySelector("#image-viewer"),
    imageViewerImage: document.querySelector("#image-viewer img"),
    imageViewerState: document.querySelector("#image-viewer-state"),
    closeImageViewer: document.querySelector("#close-image-viewer")
  };
  const state = {
    groups: [],
    currentGid: null,
    messages: new Map(),
    nextPage: FIRST_PAGE,
    total: 0,
    refreshing: false,
    failedPage: FIRST_PAGE
  };

  function initials(value, fallback) {
    return value?.trim().slice(0, 1) || fallback;
  }

  function avatar(group, className) {
    const container = document.createElement("span");
    container.className = className;
    container.setAttribute("aria-hidden", "true");
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

  function renderGroups() {
    elements.groupsList.replaceChildren();
    state.groups.forEach(group => {
      const button = document.createElement("button");
      button.className = "group-row";
      button.type = "button";
      button.dataset.gid = String(group.gid);
      button.setAttribute("aria-label",
        `${group.name || `群聊 ${group.gid}`}，${group.memberCount} 位成员`);
      button.append(avatar(group, "group-avatar"));
      const copy = document.createElement("span");
      copy.className = "group-copy";
      const name = document.createElement("span");
      name.className = "group-name";
      name.textContent = group.name || `群聊 ${group.gid}`;
      const size = document.createElement("span");
      size.className = "group-preview";
      size.textContent = `${group.memberCount} 位成员`;
      copy.append(name, size);
      button.append(copy);
      button.addEventListener("click", () => selectGroup(group.gid));
      elements.groupsList.append(button);
    });
    elements.groupsCount.textContent = `${state.groups.length} 个群聊`;
  }

  function renderMessages() {
    const ordered = [...state.messages.values()].sort((left, right) =>
      left.createdAt - right.createdAt || left.mid - right.mid);
    elements.messages.replaceChildren(...ordered.map(message => {
      const article = document.createElement("article");
      article.className = "message";
      article.dataset.mid = String(message.mid);
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = message.text || `[${message.msgTypeName || "消息"}]`;
      if (message.senderName?.trim() === "粉丝群") {
        article.classList.add("system-message");
        article.append(bubble);
        return article;
      }
      article.append(avatar({
        name: message.senderName,
        avatar: message.senderAvatar
      }, "message-avatar"));
      const content = document.createElement("div");
      content.className = "message-content";
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `${message.senderName || "未知成员"} · ${formatTime(message.createdAt)}`;
      content.append(meta, bubble);
      const media = messageMedia(message);
      if (media) content.append(media);
      article.append(content);
      return article;
    }));
  }

  function messageMedia(message) {
    if (!message.previewUrl) return null;
    const button = document.createElement("button");
    button.type = "button";
    const image = document.createElement("img");
    image.src = message.previewUrl;
    image.loading = "lazy";
    image.alt = "";
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
    }, {once: true});
    return button;
  }

  function openImage(url) {
    elements.imageViewerState.textContent = "";
    elements.imageViewerImage.src = url;
    elements.imageViewer.showModal();
    elements.closeImageViewer.focus();
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hour12: false
    }).format(new Date(timestamp));
  }

  async function selectGroup(gid) {
    const group = state.groups.find(item => item.gid === gid);
    if (!group) return;
    state.currentGid = gid;
    state.messages.clear();
    state.nextPage = FIRST_PAGE;
    state.total = 0;
    elements.newMessages.hidden = true;
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    elements.currentSize.textContent = `${group.memberCount} 人群`;
    elements.currentId.textContent = String(group.gid);
    elements.currentNotice.textContent = group.summary || "暂无简介";
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
    await loadMessages(FIRST_PAGE);
  }

  async function loadMessages(page) {
    const previousHeight = elements.messages.scrollHeight;
    const previousTop = elements.messages.scrollTop;
    state.failedPage = page;
    elements.retryMessages.hidden = true;
    elements.messagesState.textContent = "正在加载消息…";
    const query = new URLSearchParams({
      gid: String(state.currentGid), page: String(page), size: String(PAGE_SIZE)
    });
    try {
      const response = await fetch(`/chat/messages?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      state.total = result.total;
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.nextPage = page + 1;
      renderMessages();
      elements.messagesState.textContent = state.messages.size ? "" : "暂无消息";
      elements.loadEarlier.disabled = state.messages.size >= result.total || !result.items.length;
      if (page === FIRST_PAGE) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      } else {
        elements.messages.scrollTop =
          previousTop + elements.messages.scrollHeight - previousHeight;
      }
    } catch {
      elements.messagesState.textContent = "消息加载失败，请稍后重试。";
      elements.retryMessages.hidden = false;
    }
  }

  function isNearBottom() {
    return elements.messages.scrollHeight
      - elements.messages.scrollTop
      - elements.messages.clientHeight < 80;
  }

  async function refreshMessages() {
    if (!state.currentGid || state.refreshing || document.hidden) return;
    state.refreshing = true;
    const followedLatest = isNearBottom();
    const knownMids = new Set(state.messages.keys());
    const query = new URLSearchParams({
      gid: String(state.currentGid), page: String(FIRST_PAGE), size: String(PAGE_SIZE)
    });
    try {
      const response = await fetch(`/chat/messages?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.total = result.total;
      const added = result.items.some(message => !knownMids.has(message.mid));
      if (added) {
        renderMessages();
        if (followedLatest) {
          elements.messages.scrollTop = elements.messages.scrollHeight;
        } else {
          elements.newMessages.hidden = false;
        }
      }
      elements.loadEarlier.disabled = state.messages.size >= state.total;
    } catch {
    } finally {
      state.refreshing = false;
    }
  }

  async function initialize() {
    elements.retryGroups.hidden = true;
    elements.groupsState.textContent = "";
    try {
      const response = await fetch("/chat/groups", {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.groups = await response.json();
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
    const keyword = event.target.value.trim().toLocaleLowerCase("zh-CN");
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(keyword);
    });
  });
  elements.loadEarlier.addEventListener("click", () => loadMessages(state.nextPage));
  elements.retryGroups.addEventListener("click", initialize);
  elements.retryMessages.addEventListener("click", () => loadMessages(state.failedPage));
  elements.newMessages.addEventListener("click", () => {
    elements.messages.scrollTop = elements.messages.scrollHeight;
    elements.newMessages.hidden = true;
  });
  elements.closeImageViewer.addEventListener("click", () => elements.imageViewer.close());
  elements.imageViewer.addEventListener("click", event => {
    if (event.target === elements.imageViewer) elements.imageViewer.close();
  });
  elements.imageViewerImage.addEventListener("error", () => {
    elements.imageViewerState.textContent = "原图加载失败，请关闭后重试。";
  });
  window.addEventListener("focus", refreshMessages);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMessages();
  });
  setInterval(refreshMessages, 30_000);

  initialize();
})();
