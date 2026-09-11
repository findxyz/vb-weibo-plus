export function createGroupList({elements: {groupSearch, groupsCount, groupsList},
  messageView, fetchJson, getCurrentGid, onSelect, onGroupsChanged}) {
  let groups = null;
  let refreshing = false;
  function groupPreview(group) {
    const sender = group.latestSenderName?.trim() || "";
    const message = group.latestMessage?.trim() || "";
    return sender || message ? (sender ? `${sender}：${message}` : message) : `${group.maxMember || group.memberCount} 人群`;
  }
  function filter(value) {
    const keyword = value.trim().toLocaleLowerCase("zh-CN");
    groupsList.querySelectorAll(".group-row").forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(keyword); });
  }
  function render() {
    if (!groups.length) {
      groupsCount.textContent = "暂无群聊";
      groupsList.replaceChildren(
        Object.assign(document.createElement("div"), {className: "groups-empty", textContent: "暂无群聊数据"}));
      return;
    }
    groupsList.replaceChildren();
    for (const group of groups) {
      const button = document.createElement("button"); button.className = "group-row"; button.type = "button"; button.dataset.gid = String(group.gid);
      if (group.gid === getCurrentGid()) { button.classList.add("active"); button.setAttribute("aria-current", "true"); }
      const preview = groupPreview(group); button.setAttribute("aria-label", `${group.name || `群聊 ${group.gid}`}，${preview}`);
      button.append(messageView.avatar(group, "group-avatar"));
      const copy = document.createElement("span"); copy.className = "group-copy";
      const name = document.createElement("span"); name.className = "group-name"; name.textContent = group.name || `群聊 ${group.gid}`;
      const summary = document.createElement("span"); summary.className = "group-preview"; summary.textContent = preview;
      copy.append(name, summary); button.append(copy); button.addEventListener("click", () => onSelect(group.gid)); groupsList.append(button);
    }
    groupsCount.textContent = `${groups.length} 个群聊`; filter(groupSearch.value);
  }
  function sameAdmins(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }
  function groupsEqual(prev, next) {
    if (prev.length !== next.length) return false;
    return prev.every((group, index) => {
      const other = next[index];
      return group.gid === other.gid && group.name === other.name && group.avatar === other.avatar
        && group.latestMessage === other.latestMessage && group.latestSenderName === other.latestSenderName
        && group.messageCount === other.messageCount && group.memberCount === other.memberCount
        && group.maxMember === other.maxMember && sameAdmins(group.admins, other.admins);
    });
  }
  function copyGroup(group) {
    return {...group, admins: Array.isArray(group.admins) ? [...group.admins] : group.admins};
  }
  function snapshot() { return (groups || []).map(copyGroup); }
  function findGroup(gid) {
    const found = (groups || []).find(item => item.gid === gid);
    return found ? copyGroup(found) : null;
  }
  function applyGroups(next) {
    if (groups && groupsEqual(groups, next)) return;
    groups = next;
    render();
    onGroupsChanged(snapshot());
  }
  async function loadInitial() {
    if (refreshing) return snapshot();
    refreshing = true;
    try {
      applyGroups(await fetchJson("/chat/groups", {cache: "no-store"}));
      return snapshot();
    } finally { refreshing = false; }
  }
  async function refreshGroups() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      applyGroups(await fetchJson("/chat/groups", {cache: "no-store"}));
    } catch (error) { console.warn("刷新群聊列表失败：", error); }
    finally { refreshing = false; }
  }
  groupSearch.addEventListener("input", event => filter(event.target.value));
  return {findGroup, loadInitial, refreshGroups};
}
