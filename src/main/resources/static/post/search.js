// 高级搜索：关键词 + 起止日期，结果摘要做 DOM 高亮，点击跳转到对应日期与博文。
import {fetchJson} from "../shared/fetch.js";
import {localDateValue, pad, toQueryDateTime, toQueryEndTime} from "../shared/date.js";
import {appendHighlightedText} from "../shared/highlight.js";
import {showState, isDateRangeValid, formatDate} from "./helpers.js";

const SEARCH_SIZE_LIMIT = 1000;

export function createSearch({
  elements: {
    searchOpen, searchDialog, searchCancel, searchSubmit, searchKeyword,
    searchStart, searchEnd, searchStatus, searchResults, searchScopeTip
  },
  state, handleApiError, dates, posts}) {

  // 与后端 Asia/Shanghai 时区保持一致，避免本地时区导致日期错位
  function epochToDateStr(epochMillis) {
    const d = new Date(epochMillis + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function currentScopeLabel() {
    if (!state.selectedUid) return "全部博主";
    const blogger = state.bloggers.find((b) => Number(b.uid) === Number(state.selectedUid));
    return blogger ? `@${blogger.screenName}` : "当前博主";
  }

  function openSearchDialog() {
    searchScopeTip.textContent = `在「${currentScopeLabel()}」范围内搜索。`;
    searchKeyword.value = "";
    // 首次打开填默认起止：起 2010-01-01 至今
    searchStart.value = "2010-01-01";
    searchEnd.value = localDateValue(new Date());
    showState(searchStatus, "");
    searchResults.replaceChildren();
    searchSubmit.disabled = false;
    searchDialog.showModal();
    searchKeyword.focus();
  }

  async function submitSearch() {
    if (state.searching) return;
    const keyword = searchKeyword.value.trim();
    if (!keyword) {
      showState(searchStatus, "请输入关键词。");
      return;
    }
    const start = searchStart.value;
    const end = searchEnd.value;
    if (!isDateRangeValid(start, end)) {
      showState(searchStatus, "开始日期不能晚于结束日期。");
      return;
    }
    state.searching = true;
    searchSubmit.disabled = true;
    showState(searchStatus, "搜索中…");
    searchResults.replaceChildren();

    const params = new URLSearchParams();
    params.set("keyword", keyword);
    params.set("page", "1");
    params.set("size", String(SEARCH_SIZE_LIMIT));
    if (state.selectedUid) {
      params.set("uids", String(state.selectedUid));
    }
    if (start) params.set("start", toQueryDateTime(start));
    if (end) params.set("end", toQueryEndTime(end));

    try {
      const result = await fetchJson(`/post/list?${params}`);
      renderSearchResults(result, keyword);
    } catch (error) {
      if (handleApiError(error, (e) => showState(searchStatus, `搜索失败：${e.message}`))) {
        searchDialog.close();
      }
    } finally {
      state.searching = false;
      searchSubmit.disabled = false;
    }
  }

  function renderSearchResults(result, keyword) {
    searchResults.replaceChildren();
    if (!result.items || result.items.length === 0) {
      showState(searchStatus, "");
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "未找到匹配微博";
      searchResults.appendChild(empty);
      return;
    }
    if (result.total > SEARCH_SIZE_LIMIT) {
      showState(searchStatus, `已达上限（${result.total} 条），请缩小范围`);
    } else {
      showState(searchStatus, `找到 ${result.total} 条结果`);
    }
    for (const post of result.items) {
      searchResults.appendChild(createSearchResultItem(post, keyword));
    }
  }

  // 在正文纯文本里找命中词位置，截取前后文构建摘要，高亮交给 shared DOM 版（只标首处命中）
  function appendSearchSnippet(snippet, post, keyword) {
    const text = (post.contentRaw || stripHtml(post.content || "")).trim();
    if (!text) return;
    const needle = keyword?.trim() || "";
    const lower = text.toLocaleLowerCase(), lowerNeedle = needle.toLocaleLowerCase();
    const idx = needle ? lower.indexOf(lowerNeedle) : -1;
    if (idx < 0) {
      snippet.textContent = text.slice(0, 80);
      return;
    }
    const radius = 30;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + needle.length + radius);
    if (start > 0) snippet.append("…");
    appendHighlightedText(snippet, text.slice(start, end), needle, {max: 1});
    if (end < text.length) snippet.append("…");
  }

  function stripHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }

  function createSearchResultItem(post, keyword) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-result";

    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    const dateText = formatDate(post.createdAt);
    const author = post.blogger ? post.blogger.screenName : "未知博主";
    meta.textContent = `${dateText} · ${author}`;

    const snippet = document.createElement("div");
    snippet.className = "search-result-snippet";
    appendSearchSnippet(snippet, post, keyword);

    item.appendChild(meta);
    item.appendChild(snippet);
    item.addEventListener("click", () => jumpToPost(post));
    return item;
  }

  async function jumpToPost(post) {
    searchDialog.close();
    const dateStr = epochToDateStr(post.createdAt);
    // 展开日期树上该日所在的年与月并标记选中；该日不在时间轴上时列表仍按日期加载
    dates.revealDate(dateStr);
    await posts.loadPosts(dateStr);
    posts.revealPost(post.mblogId);
  }

  /* ---------- 事件绑定 ---------- */

  searchOpen.addEventListener("click", openSearchDialog);
  searchCancel.addEventListener("click", () => {
    searchDialog.close();
  });
  searchSubmit.addEventListener("click", submitSearch);
  searchKeyword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitSearch();
    }
  });
}
