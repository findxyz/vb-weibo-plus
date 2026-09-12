export const MEDIA_TYPE = {IMAGE: 1, VIDEO: 10, VIDEO_OR_REDPACKET: 13, WEIBO_CARD: 14};

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
function formatTime(timestamp) { return timeFormatter.format(new Date(timestamp)); }

const MESSAGE_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%\[\]-]+/g;
const EMOJI_PHRASE_PATTERN = /\[[^\[\]]+\]/g;
const EMOJI_IMAGE_TEST = /\[(\/[0-9a-z]+\.png)\]/i;
const EMOJI_IMAGE_BASE = "https://img.t.sinajs.cn/t4/appstyle/expression/emimage";
const SYSTEM_SENDER_NAME = "粉丝群";
// 表态优先用微博原版表情贴图（WEIBO_EMOJI_MAP，与消息内 [表情] 同源）；
// 贴图缺失时退回近似 emoji，都没有才显示原文，悬浮始终可见名称。
const ATTITUDE_ICONS = {
  good: "👍", "点赞": "👍", "赞啊": "👍", "干杯": "🍺",
  "心": "❤️", "给你小心心": "💗", "送花花": "💐", "爱慕": "😘", "憧憬": "😍",
  "太开心": "😆", "哈哈": "😃", "嘻嘻": "😁", "哇": "🤩", "期待": "🤞",
  "抱一抱": "🤗", "来抱抱": "🫂", "鼓掌": "👏", "求饶": "🙏", "打call": "🙌",
  "彩虹屁": "🌈", "不愧是你": "💯", "yeah": "🥳", "比耶": "✌️", "努力": "💪"
};

export function createMessageView({
  elements: {imageViewer, imageViewerImage, imageViewerState},
  getWeiboEmojiMap,
  isAdminSender,
  onSenderClick
}) {
  function initials(value, fallback) {
    return value?.trim().slice(0, 1) || fallback;
  }

  function avatar(group, className, profileUrl) {
    const container = document.createElement(profileUrl ? "a" : "span");
    container.className = className;
    if (profileUrl) {
      container.href = profileUrl;
      container.target = "_blank";
      container.rel = "noopener noreferrer";
      container.setAttribute("aria-label", `查看${group.name || "群友"}的微博主页`);
    } else {
      container.setAttribute("aria-hidden", "true");
    }
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

  function appendTextSegment(container, text) {
    let offset = 0;
    for (const match of text.matchAll(EMOJI_PHRASE_PATTERN)) {
      const imageMatch = match[0].match(EMOJI_IMAGE_TEST);
      const url = imageMatch
        ? EMOJI_IMAGE_BASE + imageMatch[1]
        : getWeiboEmojiMap()[match[0]];
      if (!url) continue;
      if (match.index > offset) {
        container.append(document.createTextNode(text.slice(offset, match.index)));
      }
      const image = document.createElement("img");
      image.className = "emoji";
      image.src = url;
      image.alt = match[0];
      image.loading = "lazy";
      container.append(image);
      offset = match.index + match[0].length;
    }
    if (offset < text.length) {
      container.append(document.createTextNode(text.slice(offset)));
    }
  }

  function appendMessageText(container, text) {
    let offset = 0;
    for (const match of text.matchAll(MESSAGE_URL_PATTERN)) {
      appendTextSegment(container, text.slice(offset, match.index));
      const link = document.createElement("a");
      link.href = match[0];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[0];
      container.append(link);
      offset = match.index + match[0].length;
    }
    appendTextSegment(container, text.slice(offset));
  }

  function appendWeiboCard(container, urlObject) {
    const status = urlObject.status || {};
    const author = status.user?.screen_name?.trim() || "";
    const rawText = (status.text || "").replace(/<[^>]+>/g, "").trim();
    const summary = rawText.length > 100 ? rawText.slice(0, 100) + "…" : rawText;
    const link = urlObject.url_ori || urlObject.info?.url_long || "";
    container.classList.add("weibo-card");
    if (author) {
      const authorElement = document.createElement("div");
      authorElement.className = "weibo-card-author";
      authorElement.textContent = author;
      container.append(authorElement);
    }
    if (summary) {
      const summaryElement = document.createElement("div");
      summaryElement.className = "weibo-card-summary";
      summaryElement.textContent = summary;
      container.append(summaryElement);
    }
    if (link) {
      const linkElement = document.createElement("a");
      linkElement.className = "weibo-card-link";
      linkElement.href = link;
      linkElement.target = "_blank";
      linkElement.rel = "noopener noreferrer";
      linkElement.textContent = "查看微博";
      container.append(linkElement);
    }
  }

  function openImage(url) {
    imageViewerImage.hidden = true;
    imageViewerState.textContent = "正在加载原图…";
    imageViewerImage.src = url;
    imageViewer.showModal();
  }

  function messageMedia(message, onLoad) {
    if (!message.previewUrl) return null;
    const button = document.createElement("button");
    button.type = "button";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = "";
    if (onLoad) image.addEventListener("load", onLoad, {once: true});
    image.src = message.previewUrl;
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
        video.play().catch(() => {});
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
      if (onLoad) onLoad();
    }, {once: true});
    return button;
  }

  function appendAttitudes(container, message) {
    const attitudes = Array.isArray(message.attitudes) ? message.attitudes : [];
    if (!attitudes.length) return;
    const emojiMap = getWeiboEmojiMap();
    const row = document.createElement("div");
    row.className = "message-attitudes";
    for (const attitude of attitudes) {
      if (!attitude?.name || !(attitude.count > 0)) continue;
      const chip = document.createElement("span");
      chip.className = "attitude-chip";
      if (attitude.selected) chip.classList.add("selected");
      const sticker = emojiMap[`[${attitude.name}]`];
      if (sticker) {
        const image = document.createElement("img");
        image.className = "attitude-chip-icon";
        image.src = sticker;
        image.alt = attitude.name;
        image.loading = "lazy";
        chip.append(image);
      } else {
        const icon = ATTITUDE_ICONS[attitude.name];
        chip.append(document.createTextNode(icon || attitude.name));
      }
      chip.append(document.createTextNode(String(attitude.count)));
      chip.title = attitude.name;
      row.append(chip);
    }
    if (row.children.length) container.append(row);
  }

  // 实时表态返回后原地刷新已渲染消息的表态行；没有表态则连同旧行一起清掉。
  function updateAttitudes(element, message) {
    const content = element.querySelector(".message-content");
    if (!content) return;
    content.querySelector(".message-attitudes")?.remove();
    appendAttitudes(content, message);
  }

  function messageElement(message, targetMid, onMediaLoad = null, gid = null) {
    const article = document.createElement("article");
    article.className = "message";
    article.dataset.mid = String(message.mid);
    if (message.mid === targetMid) article.classList.add("target-message");
    if (isAdminSender(message.senderId)) article.classList.add("admin-message");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.fileUrl) {
      const link = document.createElement("a");
      link.className = "file-download";
      link.href = message.fileUrl;
      link.download = message.text || "";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = message.text || "下载文件";
      bubble.append(link);
    } else if (message.mediaType === MEDIA_TYPE.WEIBO_CARD && message.urlObjects?.[0]?.status) {
      appendWeiboCard(bubble, message.urlObjects[0]);
    } else {
      appendMessageText(bubble, message.text || `[${message.msgTypeName || "消息"}]`);
    }
    if (message.senderName?.trim() === SYSTEM_SENDER_NAME) {
      article.classList.add("system-message");
      article.append(bubble);
      return article;
    }
    const senderId = Number.isSafeInteger(message.senderId) && message.senderId > 0
      ? message.senderId : 0;
    const avatarElement = avatar({name: message.senderName, avatar: message.senderAvatar},
      "message-avatar", senderId ? `https://weibo.com/u/${senderId}` : "");
    if (senderId) avatarElement.dataset.senderId = senderId;
    article.append(avatarElement);
    const content = document.createElement("div");
    content.className = "message-content";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    if (gid && onSenderClick) {
      const sender = document.createElement("button");
      sender.type = "button";
      sender.className = "message-sender";
      sender.textContent = message.senderName || "未知成员";
      sender.title = "设置回归庆祝";
      sender.addEventListener("click", () => onSenderClick(
        gid, message.senderId, message.senderName, message.senderAvatar, sender));
      meta.append(sender, document.createTextNode(` · ${formatTime(message.createdAt)}`));
    } else {
      meta.textContent = `${message.senderName || "未知成员"} · ${formatTime(message.createdAt)}`;
    }
    const media = messageMedia(message, onMediaLoad);
    const hidesBubbleText = media && ["分享图片", "分享视频", "[动画表情]"].includes(message.text?.trim());
    content.append(meta);
    if (!hidesBubbleText) content.append(bubble);
    if (media) content.append(media);
    appendAttitudes(content, message);
    article.append(content);
    return article;
  }

  imageViewer.addEventListener("click", event => {
    if (event.target === imageViewer) imageViewer.close();
  });
  imageViewerImage.addEventListener("load", () => {
    imageViewerImage.hidden = false;
    imageViewerState.textContent = "";
  });
  imageViewerImage.addEventListener("error", () => {
    imageViewerImage.hidden = true;
    imageViewerState.textContent = "原图加载失败，请关闭后重试。";
  });

  return {avatar, messageElement, updateAttitudes};
}
