// 全局无障碍通报器：大列表容器已摘掉 aria-live（轮询插入会让屏幕阅读器
// 失控复读），事件级的摘要改由这里播报。懒创建一个 visually-hidden 的
// live region 挂到 body，自包含样式、不依赖页面皮肤的 .visually-hidden。
// 相同文案 1 秒内去重；清空与写入隔开一小段，保证相同内容也能再次触发朗读。
export function createAnnouncer() {
  let region = null;
  let lastText = "";
  let lastAt = 0;
  return function announce(text) {
    if (!region) {
      region = document.createElement("div");
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      Object.assign(region.style, {
        position: "absolute", width: "1px", height: "1px", margin: "-1px",
        padding: "0", overflow: "hidden", clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap", border: "0"
      });
      document.body.append(region);
    }
    const now = Date.now();
    if (text === lastText && now - lastAt < 1000) return;
    lastText = text;
    lastAt = now;
    region.textContent = "";
    setTimeout(() => { region.textContent = text; }, 50);
  };
}
