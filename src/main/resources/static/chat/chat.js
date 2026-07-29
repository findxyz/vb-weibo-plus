(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const EARLIER_LOAD_THRESHOLD = 120;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const MESSAGE_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%\[\]-]+/g;
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
    imageViewerState: document.querySelector("#image-viewer-state")
  };
  const state = {
    groups: [],
    currentGid: null,
    messages: new Map(),
    nextBeforeCreatedAt: null,
    nextBeforeMid: null,
    hasMore: false,
    refreshing: false,
    loadingEarlier: false,
    followingLatest: true,
    failedBeforeCreatedAt: null,
    failedBeforeMid: null
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

  function appendMessageText(container, text) {
    let offset = 0;
    for (const match of text.matchAll(MESSAGE_URL_PATTERN)) {
      container.append(document.createTextNode(text.slice(offset, match.index)));
      const link = document.createElement("a");
      link.href = match[0];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[0];
      container.append(link);
      offset = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(offset)));
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
      appendMessageText(bubble, message.text || `[${message.msgTypeName || "消息"}]`);
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
      const media = messageMedia(message);
      const hidesMediaLabel = media
        && ["分享图片", "分享视频"].includes(message.text?.trim());
      content.append(meta);
      if (!hidesMediaLabel) content.append(bubble);
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
    image.addEventListener("load", () => {
      if (state.followingLatest) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      }
    });
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
    elements.imageViewerImage.hidden = true;
    elements.imageViewerState.textContent = "正在加载原图…";
    elements.imageViewerImage.src = url;
    elements.imageViewer.showModal();
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hour12: false
    }).format(new Date(timestamp));
  }

  function captureScrollAnchor() {
    const containerTop = elements.messages.getBoundingClientRect().top;
    const anchor = [...elements.messages.children].find(element =>
      element.getBoundingClientRect().bottom > containerTop);
    if (!anchor) return null;
    return {
      mid: anchor.dataset.mid,
      top: anchor.getBoundingClientRect().top
    };
  }

  function restoreScrollAnchor(anchor) {
    if (!anchor) return;
    const renderedAnchor = elements.messages.querySelector(`[data-mid="${anchor.mid}"]`);
    if (renderedAnchor) {
      elements.messages.scrollTop += renderedAnchor.getBoundingClientRect().top - anchor.top;
    }
  }

  async function selectGroup(gid) {
    const group = state.groups.find(item => item.gid === gid);
    if (!group) return;
    state.currentGid = gid;
    state.messages.clear();
    state.nextBeforeCreatedAt = null;
    state.nextBeforeMid = null;
    state.hasMore = false;
    elements.newMessages.hidden = true;
    elements.loadEarlier.disabled = true;
    elements.loadEarlier.hidden = true;
    localStorage.setItem(LAST_GROUP_KEY, String(gid));
    elements.currentGroup.textContent = group.name || `群聊 ${group.gid}`;
    elements.currentSize.textContent = `${group.maxMember || group.memberCount} 人群`;
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
    await loadMessages();
  }

  async function loadMessages(beforeCreatedAt = null, beforeMid = null) {
    const isLatestPage = beforeCreatedAt === null && beforeMid === null;
    const anchor = isLatestPage ? null : captureScrollAnchor();
    state.failedBeforeCreatedAt = beforeCreatedAt;
    state.failedBeforeMid = beforeMid;
    elements.retryMessages.hidden = true;
    if (isLatestPage) elements.messagesState.textContent = "正在加载消息…";
    const query = new URLSearchParams({
      gid: String(state.currentGid), size: String(PAGE_SIZE)
    });
    if (!isLatestPage) {
      query.set("beforeCreatedAt", String(beforeCreatedAt));
      query.set("beforeMid", String(beforeMid));
    }
    try {
      const response = await fetch(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      result.items.forEach(message => state.messages.set(message.mid, message));
      state.nextBeforeCreatedAt = result.nextBeforeCreatedAt;
      state.nextBeforeMid = result.nextBeforeMid;
      state.hasMore = result.hasMore;
      if (isLatestPage) state.followingLatest = true;
      renderMessages();
      elements.messagesState.textContent = state.messages.size ? "" : "暂无消息";
      elements.loadEarlier.disabled = !state.hasMore;
      if (isLatestPage) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      } else {
        restoreScrollAnchor(anchor);
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

  async function maybeLoadEarlierMessages() {
    if (!state.currentGid || !state.hasMore || state.loadingEarlier || state.refreshing) return;
    if (elements.messages.scrollTop > EARLIER_LOAD_THRESHOLD
      || elements.messages.scrollHeight <= elements.messages.clientHeight) return;
    if (state.nextBeforeCreatedAt === null || state.nextBeforeMid === null) return;
    state.loadingEarlier = true;
    try {
      await loadMessages(state.nextBeforeCreatedAt, state.nextBeforeMid);
    } finally {
      state.loadingEarlier = false;
    }
  }

  async function refreshMessages() {
    if (!state.currentGid || state.refreshing || state.loadingEarlier || document.hidden) return;
    state.refreshing = true;
    const followedLatest = isNearBottom();
    const knownMids = new Set(state.messages.keys());
    const query = new URLSearchParams({
      gid: String(state.currentGid), size: String(PAGE_SIZE)
    });
    try {
      const response = await fetch(`/chat/messages/cursor?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      result.items.forEach(message => state.messages.set(message.mid, message));
      const added = result.items.some(message => !knownMids.has(message.mid));
      if (added) {
        state.followingLatest = followedLatest;
        renderMessages();
        if (followedLatest) {
          elements.messages.scrollTop = elements.messages.scrollHeight;
        } else {
          elements.newMessages.hidden = false;
        }
      }
      elements.loadEarlier.disabled = !state.hasMore;
    } catch {
    } finally {
      state.refreshing = false;
      maybeLoadEarlierMessages();
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
  elements.messages.addEventListener("scroll", () => {
    state.followingLatest = isNearBottom();
    maybeLoadEarlierMessages();
  });
  elements.retryGroups.addEventListener("click", initialize);
  elements.retryMessages.addEventListener("click", () =>
    loadMessages(state.failedBeforeCreatedAt, state.failedBeforeMid));
  elements.newMessages.addEventListener("click", async () => {
    await refreshMessages();
    state.followingLatest = true;
    elements.messages.scrollTop = elements.messages.scrollHeight;
    elements.newMessages.hidden = true;
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
  window.addEventListener("focus", refreshMessages);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMessages();
  });
  setInterval(refreshMessages, 2_000);

  initialize();
})();
