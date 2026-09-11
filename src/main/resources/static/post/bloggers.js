// 博主列表与博主管理：加载/筛选/选中，添加博主与同步历史微博两个弹窗。
import {fetchJson} from "../shared/fetch.js";
import {localDateValue} from "../shared/date.js";
import {showState, isDateRangeValid, createVerifiedBadge} from "./helpers.js";

export function createBloggers({
  elements: {
    bloggersCount, bloggersList, bloggersState, allBloggersRow, bloggerSearch,
    currentFilter, syncHistoryOpen, globalTip, posts, postsState, feedCount,
    datesState, datesList,
    bloggerAdd, addBloggerDialog, addBloggerCancel, addBloggerSubmit, addBloggerInput,
    addBloggerError, syncHistoryDialog, syncHistoryBlogger, syncHistoryStart,
    syncHistoryEnd, syncHistoryStatus, syncHistoryCancel, syncHistorySubmit
  },
  state, handleApiError, datesApi, postsApi}) {

  async function loadBloggers(selectAll = true) {
    showState(bloggersState, "");
    bloggersCount.textContent = "正在加载…";
    try {
      const list = await fetchJson("/post/bloggers");
      state.bloggers = list;
      renderBloggers(list);
      bloggersCount.textContent = `${list.length} 位博主`;
      if (selectAll) {
        selectAllBloggers();
      }
    } catch (error) {
      handleApiError(error, (e) => showState(bloggersState, `加载失败：${e.message}`));
      bloggersCount.textContent = "加载失败";
    }
  }

  function renderBloggers(list) {
    // 保留顶部的「全部博主」行，只重建其后的博主行
    for (const row of bloggersList.querySelectorAll(".blogger-row:not(.all-bloggers)")) {
      row.remove();
    }
    for (const blogger of list) {
      bloggersList.appendChild(createBloggerRow(blogger));
    }
  }

  function createBloggerRow(blogger) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "blogger-row";
    row.dataset.uid = String(blogger.uid);
    row.dataset.name = blogger.screenName;

    const avatar = document.createElement("span");
    avatar.className = "blogger-avatar";
    if (blogger.avatar) {
      const img = document.createElement("img");
      img.src = blogger.avatar;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (blogger.screenName || "?").charAt(0);
    }

    const info = document.createElement("div");
    info.className = "blogger-info";

    const name = document.createElement("div");
    name.className = "blogger-name";
    name.textContent = blogger.screenName;
    if (blogger.verified) {
      name.appendChild(createVerifiedBadge());
    }

    info.appendChild(name);
    row.appendChild(avatar);
    row.appendChild(info);

    row.addEventListener("click", () => selectBlogger(blogger));
    return row;
  }

  function selectAllBloggers() {
    state.selectedUid = null;
    setActiveBloggerRow(allBloggersRow);
    currentFilter.textContent = "全部微博";
    syncHistoryOpen.hidden = true;
    onBloggerChanged();
  }

  function selectBlogger(blogger) {
    state.selectedUid = blogger.uid;
    const row = bloggersList.querySelector(
      `.blogger-row:not(.all-bloggers)[data-uid="${blogger.uid}"]`);
    setActiveBloggerRow(row);
    currentFilter.textContent = `${blogger.screenName} 的微博`;
    syncHistoryOpen.hidden = false;
    onBloggerChanged();
  }

  function setActiveBloggerRow(row) {
    for (const r of bloggersList.querySelectorAll(".blogger-row")) {
      r.classList.toggle("active", r === row);
    }
  }

  async function onBloggerChanged() {
    state.selectedDate = null;
    posts.replaceChildren();
    showState(postsState, "");
    feedCount.textContent = "";
    await datesApi.loadDates();
    const firstMonth = datesList.querySelector(".month-group");
    if (firstMonth) {
      const firstYear = firstMonth.closest(".year-group");
      if (firstYear) {
        firstYear.classList.add("open");
      }
      datesApi.toggleGroup(firstMonth);
      const firstDay = firstMonth.querySelector(".date-item");
      if (firstDay) {
        postsApi.selectDate(firstDay.dataset.date, firstDay);
      } else {
        showState(postsState, "该月无微博");
      }
    } else {
      showState(postsState, "无微博数据");
    }
  }

  function filterBloggers() {
    const keyword = bloggerSearch.value.trim().toLowerCase();
    for (const row of bloggersList.querySelectorAll(".blogger-row:not(.all-bloggers)")) {
      const name = (row.dataset.name || "").toLowerCase();
      row.hidden = keyword && !name.includes(keyword);
    }
  }

  /* ---------- 添加博主 ---------- */

  // 支持纯 UID、weibo.com/u/xxx、weibo.com/xxx 三种输入，返回 uid 字符串
  function parseBloggerUid(input) {
    const value = input.trim();
    if (/^\d{4,}$/.test(value)) {
      return value;
    }
    const match = value.match(/weibo\.com\/(?:u\/)?(\d{4,})/);
    return match ? match[1] : null;
  }

  function openAddBloggerDialog() {
    addBloggerInput.value = "";
    showState(addBloggerError, "");
    addBloggerSubmit.disabled = false;
    addBloggerDialog.showModal();
    addBloggerInput.focus();
  }

  async function submitAddBlogger() {
    if (addBloggerSubmit.disabled) {
      return;
    }
    const uid = parseBloggerUid(addBloggerInput.value);
    if (!uid) {
      showState(addBloggerError,
        "无法识别，请输入 UID 或 weibo.com/u/ 开头的主页链接。");
      return;
    }
    addBloggerSubmit.disabled = true;
    showState(addBloggerError, "正在添加并拉取微博…");
    try {
      await fetchJson(`/post/bloggers?uid=${uid}`, {method: "POST"});
      addBloggerDialog.close();
      await reloadBloggersAndSelect(Number(uid));
    } catch (error) {
      if (handleApiError(error, (e) => showState(addBloggerError, `添加失败：${e.message}`))) {
        addBloggerDialog.close();
      }
    } finally {
      addBloggerSubmit.disabled = false;
    }
  }

  async function reloadBloggersAndSelect(uid) {
    // 跳过 loadBloggers 默认的「全部博主」选中，避免与新博主的选中产生竞态
    await loadBloggers(false);
    const blogger = state.bloggers.find((b) => Number(b.uid) === uid);
    if (blogger) {
      selectBlogger(blogger);
    }
  }

  /* ---------- 同步历史微博 ---------- */

  function openSyncHistoryDialog() {
    const blogger = state.bloggers.find(
      (b) => Number(b.uid) === Number(state.selectedUid));
    if (!blogger) return;
    syncHistoryBlogger.textContent = `@${blogger.screenName}`;
    // 与群聊页保持一致：默认同步最近两年到今天
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    syncHistoryStart.value = localDateValue(start);
    syncHistoryEnd.value = localDateValue(end);
    showSyncHistoryStatus("", false);
    syncHistorySubmit.disabled = false;
    syncHistoryDialog.showModal();
  }

  function showSyncHistoryStatus(message, ok) {
    syncHistoryStatus.textContent = message || "";
    syncHistoryStatus.classList.toggle("ok", Boolean(ok));
  }

  function submitSyncHistory() {
    const start = syncHistoryStart.value;
    const end = syncHistoryEnd.value;
    if (!start || !end) {
      showSyncHistoryStatus("请选择开始与结束日期。", false);
      return;
    }
    if (!isDateRangeValid(start, end)) {
      showSyncHistoryStatus("开始日期不能晚于结束日期。", false);
      return;
    }
    // 同步在服务端执行，发起后立即关闭弹窗，由后台任务接管
    syncHistoryDialog.close();
    runSyncHistory(Number(state.selectedUid), start, end);
  }

  async function runSyncHistory(uid, start, end) {
    syncHistoryOpen.disabled = true;
    const params = new URLSearchParams({
      uid: String(uid),
      start: `${start} 00:00:00`,
      end: `${end} 23:59:59`,
    });
    try {
      await fetchJson(`/post/range?${params}`, {method: "POST"});
      // 刷新日期时间轴，让新同步的日期出现在面板里
      await datesApi.loadDates();
      showState(datesState, "同步完成");
    } catch (error) {
      // 错误在主窗口右上角醒目提示，不再写进日期标题旁的 #dates-state 造成重影
      handleApiError(error, (e) => showGlobalTip(`同步历史微博失败：${e.message}`));
    } finally {
      syncHistoryOpen.disabled = false;
    }
  }

  let globalTipTimer = null;
  function showGlobalTip(message) {
    globalTip.textContent = message;
    globalTip.hidden = false;
    if (globalTipTimer) clearTimeout(globalTipTimer);
    globalTipTimer = setTimeout(() => {
      globalTip.hidden = true;
      globalTipTimer = null;
    }, 6000);
  }

  /* ---------- 事件绑定 ---------- */

  allBloggersRow.addEventListener("click", selectAllBloggers);
  bloggerSearch.addEventListener("input", filterBloggers);

  bloggerAdd.addEventListener("click", openAddBloggerDialog);
  addBloggerCancel.addEventListener("click", () => {
    addBloggerDialog.close();
  });
  addBloggerSubmit.addEventListener("click", submitAddBlogger);
  addBloggerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitAddBlogger();
    }
  });

  syncHistoryOpen.addEventListener("click", openSyncHistoryDialog);
  syncHistoryCancel.addEventListener("click", () => {
    syncHistoryDialog.close();
  });
  syncHistorySubmit.addEventListener("click", submitSyncHistory);

  return {loadBloggers};
}
