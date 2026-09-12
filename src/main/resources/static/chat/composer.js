import {fetchJson} from "../shared/fetch.js";

const HINT_DEFAULT = "按下 Enter 发送内容 / Shift+Enter 换行";
const HINT_SENDING = "发送中…";
const HINT_CONFLICT = "消息已发出，但本地同步失败，稍后会自动补全。";
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export function createComposer({
  elements: {
    composer, composerHint, imagePickerOpen, imageInput, videoPickerOpen, videoInput,
    composerAttachment, composerAttachmentPreview, composerAttachmentPreviewVideo, composerAttachmentRemove
  },
  getGid, onRefresh, onSent}) {
  let sending = false;
  let pendingAttachment = null;
  // 提示状态由变量管理，不从 DOM 文本反读
  let hintLevel = "default";

  function setComposerHint(text, level = "default") {
    hintLevel = level;
    composerHint.textContent = text;
    composerHint.classList.toggle("is-sending", level === "sending");
    composerHint.classList.toggle("is-error", level === "error");
  }

  // 附件入口可用性的唯一写者：有选中群且不在发送中时可用
  function refreshAvailability() {
    imagePickerOpen.disabled = sending || !getGid();
    videoPickerOpen.disabled = sending || !getGid();
  }

  function setBusyUi(busy) {
    composer.disabled = busy;
    refreshAvailability();
    if (!busy) composer.focus();
  }

  // 发送公共骨架：加锁禁用 UI → 执行请求与成功回调 → 复位并聚焦。
  // 409 是服务端确认已发出但本地同步失败的特例，默认文案与普通失败不同。
  async function send(request, fallbackError) {
    if (sending) return;
    sending = true;
    setBusyUi(true);
    setComposerHint(HINT_SENDING, "sending");
    try {
      await request();
    } catch (error) {
      const message = error.status === 409
        ? (error.msg || HINT_CONFLICT)
        : (error.msg || fallbackError);
      setComposerHint(message, "error");
    } finally {
      sending = false;
      setBusyUi(false);
    }
  }

  function setPendingAttachment(kind, file) {
    if (!file) return;
    const isImage = kind === "image";
    const validType = isImage ? file.type.startsWith("image/") : file.type === "video/mp4";
    if (!validType) {
      setComposerHint(isImage ? "仅支持图片文件。" : "仅支持 MP4 视频文件。", "error");
      return;
    }
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      setComposerHint(isImage ? "图片不能超过 20MB。" : "视频不能超过 100MB。", "error");
      return;
    }
    clearPendingAttachment();
    pendingAttachment = {kind, file, url: URL.createObjectURL(file)};
    composerAttachmentPreview.src = isImage ? pendingAttachment.url : "";
    composerAttachmentPreview.hidden = !isImage;
    composerAttachmentPreviewVideo.src = isImage ? "" : pendingAttachment.url;
    composerAttachmentPreviewVideo.hidden = isImage;
    composerAttachment.hidden = false;
    composerAttachment.focus();
    setComposerHint(isImage ? "按下 Enter 发送图片" : "按下 Enter 发送视频");
  }

  function clearPendingAttachment() {
    if (pendingAttachment) {
      URL.revokeObjectURL(pendingAttachment.url);
    }
    pendingAttachment = null;
    composerAttachment.hidden = true;
    composerAttachmentPreview.src = "";
    composerAttachmentPreview.hidden = false;
    composerAttachmentPreviewVideo.src = "";
    composerAttachmentPreviewVideo.hidden = true;
    if (imageInput.value) {
      imageInput.value = "";
    }
    if (videoInput.value) {
      videoInput.value = "";
    }
  }

  async function sendAttachment() {
    const gid = getGid();
    if (sending || !gid || !pendingAttachment) return;
    const kind = pendingAttachment.kind;
    const endpoint = kind === "image" ? "/chat/messages/sendImage" : "/chat/messages/sendVideo";
    const fallbackError = kind === "image" ? "图片发送失败，请稍后重试。" : "视频发送失败，请稍后重试。";
    await send(async () => {
      const formData = new FormData();
      formData.append("gid", String(gid));
      formData.append("file", pendingAttachment.file);
      await fetchJson(endpoint, {method: "POST", body: formData});
      clearPendingAttachment();
      onSent(gid);
      await onRefresh(gid);
      setComposerHint(HINT_DEFAULT);
    }, fallbackError);
  }

  async function sendMessage() {
    if (pendingAttachment) {
      await sendAttachment();
      return;
    }
    const gid = getGid();
    if (sending || !gid) return;
    const content = composer.value.trim();
    if (!content) return;
    await send(async () => {
      await fetchJson("/chat/messages/send", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({gid: String(gid), content})
      });
      composer.value = "";
      onSent(gid);
      await onRefresh(gid);
      setComposerHint(HINT_DEFAULT);
    }, "消息发送失败，请稍后重试。");
  }

  composer.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.metaKey) { event.preventDefault(); sendMessage(); }
  });
  composerAttachment.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.metaKey) { event.preventDefault(); sendMessage(); }
  });
  composer.addEventListener("input", () => {
    if (hintLevel !== "sending") setComposerHint(HINT_DEFAULT);
  });
  const handlePaste = event => {
    if (!getGid()) return;
    for (const item of event.clipboardData?.items || []) {
      if (item.kind === "file" && item.type.startsWith("image/")) { event.preventDefault(); setPendingAttachment("image", item.getAsFile()); return; }
      if (item.kind === "file" && item.type.startsWith("video/")) { event.preventDefault(); setPendingAttachment("video", item.getAsFile()); return; }
    }
  };
  composer.addEventListener("paste", handlePaste);
  composerAttachment.addEventListener("paste", handlePaste);
  imagePickerOpen.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => imageInput.files?.[0] && setPendingAttachment("image", imageInput.files[0]));
  videoPickerOpen.addEventListener("click", () => videoInput.click());
  videoInput.addEventListener("change", () => videoInput.files?.[0] && setPendingAttachment("video", videoInput.files[0]));
  composerAttachmentRemove.addEventListener("click", clearPendingAttachment);
  // JS 运行后提示文案以这里为唯一来源；HTML 里的初始文案只是未加载时的兜底
  setComposerHint(HINT_DEFAULT);

  return {refreshAvailability};
}
