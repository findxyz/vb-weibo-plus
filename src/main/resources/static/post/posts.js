// 微博列表：按日加载与博文卡片渲染（正文 linkify、转发块、图片、视频）。
import {fetchJson} from "../shared/fetch.js";
import {toQueryDateTime, toQueryEndTime} from "../shared/date.js";
import {showState, createVerifiedBadge, formatDate} from "./helpers.js";

const DAY_PAGE_SIZE = 9999;

export function createPosts({
  elements: {posts, postsState, feedCount, retryPosts, datesList},
  state, handleApiError, openImageViewer}) {

  async function selectDate(date, itemEl) {
    if (state.loadingPosts) return;
    activateDate(date, itemEl);
    await loadPosts(date);
  }

  // 归位选中态与 selectedDate。不带加载中的早退判断：手动点选走 selectDate（有守卫），
  // 搜索跳转（jumpToPost）是明确的程序性切换，即使上一轮加载未落也必须改选日期。
  function activateDate(date, itemEl) {
    for (const el of datesList.querySelectorAll(".date-item.active")) {
      el.classList.remove("active");
    }
    if (itemEl) itemEl.classList.add("active");
    state.selectedDate = date;
  }

  async function loadPosts(date) {
    state.loadingPosts = true;
    showState(postsState, "正在加载…");
    retryPosts.hidden = true;
    posts.replaceChildren();

    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("size", String(DAY_PAGE_SIZE));
    if (state.selectedUid) {
      params.set("uids", String(state.selectedUid));
    }
    const start = toQueryDateTime(date);
    const end = toQueryEndTime(date);
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    try {
      const result = await fetchJson(`/post/list?${params}`);
      renderPosts(result.items);
      feedCount.textContent = `共 ${result.total} 条`;
      if (result.items.length === 0) {
        showState(postsState, "该日无微博");
      } else {
        showState(postsState, "");
      }
    } catch (error) {
      handleApiError(error, (e) => {
        showState(postsState, `加载失败：${e.message}`);
        retryPosts.hidden = false;
      });
    } finally {
      state.loadingPosts = false;
    }
  }

  function renderPosts(items) {
    posts.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const post of items) {
      fragment.appendChild(createPostCard(post));
    }
    posts.appendChild(fragment);
  }

  // 只有同时拿到视频页地址和封面图，才展示视频卡片
  function hasPlayableVideo(video) {
    return Boolean(video && video.pageUrl && video.coverUrl);
  }

  function createPostCard(post) {
    const isPureRetweet = !post.content
      && (!post.pics || post.pics.length === 0)
      && !hasPlayableVideo(post.video)
      && post.retweeted;

    const card = document.createElement("article");
    card.className = "post-card" + (isPureRetweet ? " pure-retweet" : "");
    card.id = "post-" + post.mblogId;

    if (!isPureRetweet) {
      card.appendChild(createAvatar(post.blogger));
    }

    const body = document.createElement("div");
    body.className = "post-body";

    body.appendChild(createPostHeader(post));
    if (post.content) {
      body.appendChild(createPostContent(post));
    }

    if (post.pics && post.pics.length > 0) {
      body.appendChild(createPostPics(post.pics, post.mblogId));
    }

    // 外层视频与转发视频指向同一地址时，只保留转发中的那个
    const retweetVideo = post.retweeted && hasPlayableVideo(post.retweeted.video)
      ? post.retweeted.video
      : null;
    const hideOuterVideo = hasPlayableVideo(post.video)
      && retweetVideo
      && post.video.pageUrl === retweetVideo.pageUrl;
    if (hasPlayableVideo(post.video) && !hideOuterVideo) {
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
    // 有 UID 时头像渲染为链接，点击跳转到博主微博首页
    const hasHomepage = blogger && blogger.uid;
    const avatar = document.createElement(hasHomepage ? "a" : "span");
    avatar.className = "post-avatar";
    if (hasHomepage) {
      avatar.href = `https://weibo.com/u/${blogger.uid}`;
      avatar.target = "_blank";
      avatar.rel = "noopener";
      avatar.title = `前往 ${blogger.screenName || "博主"} 的微博首页`;
    }
    if (blogger && blogger.avatar) {
      const img = document.createElement("img");
      img.src = blogger.avatar;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
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
      author.appendChild(createVerifiedBadge());
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

  // 纵深防御：content 已是后端清洗过的安全内容，这里在解析后的 DOM 树上
  // 再做一次白名单清理——移除脚本类元素、on* 事件属性与 javascript: 链接，
  // 正常微博正文（表情图、链接、@提及）渲染结果不受影响
  function sanitizeContentTree(root) {
    for (const el of root.querySelectorAll("script, iframe, style, object, embed")) {
      el.remove();
    }
    for (const el of root.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
        } else if (name === "href" && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }

  function renderContent(html) {
    if (!html) return "";
    // content 字段是微博富文本 HTML，已是后端处理后的安全内容；
    // 这里统一修正链接：相对地址（如 @ 用户的 /n/xxx）补全为微博域名，
    // 协议相对地址补全 https，并让所有链接在新窗口打开；
    // 纯文本里的 http/https 地址自动转为可点击链接
    const doc = new DOMParser().parseFromString(html, "text/html");
    sanitizeContentTree(doc.body);
    linkifyUrls(doc.body);
    linkifyMentions(doc.body);
    for (const a of doc.querySelectorAll("a")) {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("//")) {
        a.setAttribute("href", "https:" + href);
      } else if (href.startsWith("/")) {
        a.setAttribute("href", "https://weibo.com" + href);
      }
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    }
    return doc.body.innerHTML;
  }

  // 匹配 http/https 地址，字符类里排除空白、引号（含中文弯引号）、尖括号与常见中文标点
  const URL_TEXT_RE = /https?:\/\/[^\s<>"'“”‘’（）【】《》，。；：、！？…]+/gi;
  // 地址末尾容易粘带的英文标点，链接化时剥掉
  const URL_TRAILING_RE = /[.,;:!?)\]}'"]/;

  // 在文本节点里按正则替换：跳过已在 <a> 内的文本，命中处由 buildReplacement 生成替换节点
  function replaceTextMatches(root, testRe, matchRe, buildReplacement) {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // 已在 <a> 内的文本不重复处理
      if (node.parentElement && node.parentElement.closest("a")) continue;
      if (testRe.test(node.nodeValue)) targets.push(node);
    }
    for (const node of targets) {
      const text = node.nodeValue;
      const frag = doc.createDocumentFragment();
      let last = 0;
      let matched = false;
      matchRe.lastIndex = 0;
      let m;
      while ((m = matchRe.exec(text))) {
        const replacement = buildReplacement(m, text, doc);
        if (!replacement) continue;
        matched = true;
        if (m.index > last) {
          frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        }
        frag.appendChild(replacement.node);
        last = m.index + replacement.length;
      }
      if (!matched) continue;
      frag.appendChild(doc.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function linkifyUrls(root) {
    replaceTextMatches(root, /https?:\/\//i, URL_TEXT_RE, (m, _text, doc) => {
      let url = m[0];
      while (url && URL_TRAILING_RE.test(url[url.length - 1])) {
        const tail = url[url.length - 1];
        // 成对括号只剥不成对的（如 wiki/A_(B) 的右括号保留）
        if (tail === ")" && (url.split("(").length - 1) >= (url.split(")").length - 1)) break;
        if (tail === "]" && (url.split("[").length - 1) >= (url.split("]").length - 1)) break;
        url = url.slice(0, -1);
      }
      if (!url) return null;
      const a = doc.createElement("a");
      a.setAttribute("href", url);
      a.textContent = url;
      return {node: a, length: url.length};
    });
  }

  // 转发链里的 @用户名: 形式（如 //@tombkeeper: 文本），纯文本时无链接；
  // 仅匹配后跟冒号的 @用户名，避免误伤邮箱与普通提及
  const MENTION_RE = /@[A-Za-z0-9_\-\u4e00-\u9fff]+(?=:)/g;

  function linkifyMentions(root) {
    replaceTextMatches(root, /@[A-Za-z0-9_\-\u4e00-\u9fff]+:/, MENTION_RE, (m, _text, doc) => {
      const a = doc.createElement("a");
      a.setAttribute("href", "https://weibo.com/n/" + m[0].slice(1));
      a.textContent = m[0];
      return {node: a, length: m[0].length};
    });
  }

  // 单个微博图片格子：列表只加载缩略图，点击查看时才加载原图（本微博与转发共用）
  function createPicEl(pic, mblogId, className, alt, href, setSize) {
    const picEl = document.createElement("a");
    picEl.className = className;
    picEl.href = href;
    picEl.dataset.mblogId = mblogId;
    const img = document.createElement("img");
    img.src = pic.thumbnailUrl || pic.originalUrl;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    if (setSize) {
      const width = pic.thumbnailWidth || pic.originalWidth;
      const height = pic.thumbnailHeight || pic.originalHeight;
      if (width > 0 && height > 0) {
        img.width = width;
        img.height = height;
      }
    }
    // 加载失败时隐藏整个格子，避免碎图图标与 alt 文字
    img.onerror = () => { picEl.hidden = true; };
    picEl.appendChild(img);
    return picEl;
  }

  function createPostPics(pics, mblogId) {
    const validPics = pics.filter((p) => p.thumbnailUrl || p.originalUrl);
    const container = document.createElement("div");
    container.className = "post-pics" + (pics.length === 1 ? " one-image" : "");
    validPics.forEach((pic, index) => {
      const picEl = createPicEl(pic, mblogId, "post-pic", "微博图片",
        pic.originalUrl || pic.thumbnailUrl, true);
      picEl.addEventListener("click", (e) => {
        e.preventDefault();
        openImageViewer(validPics, index);
      });
      container.appendChild(picEl);
    });
    return container;
  }

  function createPostVideo(video) {
    const wrapper = document.createElement("a");
    wrapper.className = "post-video";
    wrapper.href = video.pageUrl;
    wrapper.target = "_blank";
    wrapper.rel = "noopener";

    const img = document.createElement("img");
    img.src = video.coverUrl;
    img.alt = "视频封面";
    img.loading = "lazy";
    img.decoding = "async";
    // 封面加载失败时只隐藏图片，保留可点击的播放占位
    img.onerror = () => { img.hidden = true; };
    wrapper.appendChild(img);

    // 三角形用 CSS 绘制，避免 ▶ 字符在不同字体下偏移
    const play = document.createElement("span");
    play.className = "post-video-play";
    play.appendChild(document.createElement("span"));
    wrapper.appendChild(play);

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
      const validRetweetPics = retweet.pics.filter((p) => p.thumbnailUrl || p.originalUrl);
      if (validRetweetPics.length > 0) {
        const pics = document.createElement("div");
        pics.className = "post-retweet-pics";
        validRetweetPics.forEach((pic, index) => {
          const picEl = createPicEl(pic, mblogId, "post-retweet-pic", "转发微博图片", pic.originalUrl || pic.thumbnailUrl, false);
          picEl.addEventListener("click", (e) => {
            e.preventDefault();
            openImageViewer(validRetweetPics, index);
          });
          pics.appendChild(picEl);
        });
        block.appendChild(pics);
      }
    }

    if (hasPlayableVideo(retweet.video)) {
      block.appendChild(createPostVideo(retweet.video));
    }

    return block;
  }

  function createPostActions(post) {
    const actions = document.createElement("div");
    actions.className = "post-actions";

    const link = document.createElement("a");
    link.className = "post-link";
    link.href = post.postUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "查看原文";

    actions.appendChild(link);
    return actions;
  }

  // 程序性清空列表与计数（博主切换时使用），不触碰选中日期等页面状态
  function clear() {
    posts.replaceChildren();
    showState(postsState, "");
    feedCount.textContent = "";
  }

  function showStatus(message) {
    showState(postsState, message);
  }

  retryPosts.addEventListener("click", () => {
    if (state.selectedDate) loadPosts(state.selectedDate);
  });

  return {selectDate, activateDate, loadPosts, clear, showStatus};
}
