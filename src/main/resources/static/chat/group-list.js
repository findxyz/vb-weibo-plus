export function createGroupList({elements, messageView, getGroups, getCurrentGid, onSelect}) {
  function groupPreview(group) {
    const sender = group.latestSenderName?.trim() || "";
    const message = group.latestMessage?.trim() || "";
    return sender || message ? (sender ? `${sender}：${message}` : message) : `${group.maxMember || group.memberCount} 人群`;
  }
  function filter(value) {
    const keyword = value.trim().toLocaleLowerCase("zh-CN");
    elements.groupsList.querySelectorAll(".group-row").forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(keyword); });
  }
  function render() {
    elements.groupsList.replaceChildren();
    for (const group of getGroups()) {
      const button = document.createElement("button"); button.className = "group-row"; button.type = "button"; button.dataset.gid = String(group.gid);
      if (group.gid === getCurrentGid()) { button.classList.add("active"); button.setAttribute("aria-current", "true"); }
      const preview = groupPreview(group); button.setAttribute("aria-label", `${group.name || `群聊 ${group.gid}`}，${preview}`);
      button.append(messageView.avatar(group, "group-avatar"));
      const copy = document.createElement("span"); copy.className = "group-copy";
      const name = document.createElement("span"); name.className = "group-name"; name.textContent = group.name || `群聊 ${group.gid}`;
      const summary = document.createElement("span"); summary.className = "group-preview"; summary.textContent = preview;
      copy.append(name, summary); button.append(copy); button.addEventListener("click", () => onSelect(group.gid)); elements.groupsList.append(button);
    }
    elements.groupsCount.textContent = `${getGroups().length} 个群聊`; filter(elements.groupSearch.value);
  }
  elements.groupSearch.addEventListener("input", event => filter(event.target.value));
  return {render, filter};
}
