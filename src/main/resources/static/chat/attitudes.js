// 表态开关与按需拉取：开关状态持久化在 localStorage，打开时立即为当前可见消息
// 补一次表态，之后由页面在消息到达回调里随批刷新；结果经会话模块统一应用，
// 失败静默降级，不影响消息本身展示。
import {fetchJson} from "../shared/fetch.js";

const ATTITUDES_KEY = "weibo-chat:attitudes";

export function createAttitudes({
  elements: {attitudesToggle},
  getCurrentGid, getRenderedMessages, applyAttitudes}) {
  let enabled = localStorage.getItem(ATTITUDES_KEY) === "1";

  function applyToggle() {
    attitudesToggle.classList.toggle("active", enabled);
    attitudesToggle.setAttribute("aria-pressed", String(enabled));
    const label = enabled ? "表态已打开，随每次查询实时刷新" : "是否打开表态";
    attitudesToggle.setAttribute("aria-label", label);
    attitudesToggle.title = label;
  }

  // 开关打开时立即为当前可见窗口补一次表态，不等下一次查询
  function loadVisible() {
    load(getCurrentGid(), getRenderedMessages());
  }

  async function load(gid, items) {
    if (!enabled || !items.length || gid !== getCurrentGid()) return;
    const mids = [...new Set(items.map(message => String(message.mid)))];
    try {
      const result = await fetchJson(
        `/chat/attitudes?${new URLSearchParams({gid: String(gid), mids: mids.join(",")})}`,
        {cache: "no-store"});
      if (gid !== getCurrentGid()) return;
      applyAttitudes(gid, result);
    } catch (error) {
      console.warn("获取表态失败：", error);
    }
  }

  attitudesToggle.addEventListener("click", () => {
    enabled = !enabled;
    localStorage.setItem(ATTITUDES_KEY, enabled ? "1" : "0");
    applyToggle();
    if (enabled) loadVisible();
  });
  applyToggle();

  return {load};
}
