(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const LAST_GROUP_KEY = "weibo-chat:last-gid";
  const elements = {
    appTitle: document.querySelector("#app-title"),
    groupsCount: document.querySelector("#groups-count"),
    groupsList: document.querySelector("#groups-list"),
    groupsState: document.querySelector("#groups-state"),
    groupSearch: document.querySelector("#group-search"),
    currentGroup: document.querySelector("#current-group"),
    currentSize: document.querySelector("#current-size"),
    currentId: document.querySelector("#current-id"),
    currentNotice: document.querySelector("#current-notice"),
    currentAvatar: document.querySelector("#current-group-avatar"),
    messages: document.querySelector("#messages"),
    messagesState: document.querySelector("#messages-state"),
    loadEarlier: document.querySelector("#load-earlier")
  };
  const state = { groups: [], currentGid: null, total: 0 };

  function initials(value, fallback) {
    return value?.trim().slice(0, 1) || fallback;
  }

  function avatar(group, className) {
    const container = document.createElement("span");
    container.className = className;
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

  function renderMessages(items) {
    const ordered = [...items].sort((left, right) =>
      left.createdAt - right.createdAt || left.mid - right.mid);
    elements.messages.replaceChildren(...ordered.map(message => {
      const article = document.createElement("article");
      article.className = "message";
      article.dataset.mid = String(message.mid);
      article.append(avatar({
        name: message.senderName,
        avatar: message.senderAvatar
      }, "message-avatar"));
      const content = document.createElement("div");
      content.className = "message-content";
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `${message.senderName || "未知成员"} · ${formatTime(message.createdAt)}`;
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = message.text || `[${message.msgTypeName || "消息"}]`;
      content.append(meta, bubble);
      article.append(content);
      return article;
    }));
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
    await loadMessages();
  }

  async function loadMessages() {
    elements.messagesState.textContent = "正在加载消息…";
    const query = new URLSearchParams({
      gid: String(state.currentGid), page: "0", size: String(PAGE_SIZE)
    });
    try {
      const response = await fetch(`/chat/messages?${query}`, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      state.total = result.total;
      renderMessages(result.items);
      elements.messagesState.textContent = result.items.length ? "" : "暂无消息";
      elements.loadEarlier.disabled = result.items.length >= result.total;
      elements.messages.scrollTop = elements.messages.scrollHeight;
    } catch {
      elements.messagesState.textContent = "消息加载失败，请稍后重试。";
    }
  }

  async function initialize() {
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
    }
  }

  elements.groupSearch.addEventListener("input", event => {
    const keyword = event.target.value.trim().toLocaleLowerCase("zh-CN");
    elements.groupsList.querySelectorAll(".group-row").forEach(row => {
      row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(keyword);
    });
  });

  initialize();
})();
