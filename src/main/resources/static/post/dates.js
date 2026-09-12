// 日期时间轴：年 → 月 → 日三级折叠，点某天进入当日微博列表。
// onSelectDate(dateStr) 请求切换日期，返回是否被接受（列表加载中时拒绝）；
// 选中高亮只在被接受后更新，保证高亮与列表内容一致。
// 对外语言只有日期字符串，分组 DOM 是模块内部细节。
import {fetchJson} from "../shared/fetch.js";
import {showState} from "./helpers.js";

export function createDates({
  elements: {datesState, datesList},
  state, handleApiError, onSelectDate}) {

  async function loadDates() {
    showState(datesState, "加载中…");
    datesList.replaceChildren();
    const params = new URLSearchParams();
    if (state.selectedUid) {
      params.set("uid", String(state.selectedUid));
    }
    try {
      const result = await fetchJson(`/post/calendar?${params}`);
      renderDates(result.months);
      showState(datesState, result.months.length ? "" : "无数据");
    } catch (error) {
      handleApiError(error, (e) => showState(datesState, "加载失败"));
    }
  }

  function renderDates(months) {
    datesList.replaceChildren();
    // 按 年 → 月 → 日 三级聚合，月份字符串为 YYYY-MM
    const byYear = new Map();
    for (const month of months) {
      const year = month.month.slice(0, 4);
      if (!byYear.has(year)) {
        byYear.set(year, []);
      }
      byYear.get(year).push(month);
    }
    for (const [year, yearMonths] of byYear) {
      datesList.appendChild(createYearGroup(year, yearMonths));
    }
  }

  function createYearGroup(year, months) {
    const group = document.createElement("div");
    group.className = "year-group";
    group.dataset.year = year;

    const header = document.createElement("div");
    header.className = "year-header";
    header.textContent = year + " 年";
    const count = document.createElement("span");
    count.className = "year-count";
    const total = months.reduce((sum, m) => sum + m.count, 0);
    count.textContent = `${total} 条`;
    header.appendChild(count);
    header.addEventListener("click", () => toggleGroup(group));
    group.appendChild(header);

    const monthsEl = document.createElement("div");
    monthsEl.className = "year-months";
    for (const month of months) {
      monthsEl.appendChild(createMonthGroup(month));
    }
    group.appendChild(monthsEl);
    return group;
  }

  function createMonthGroup(month) {
    const group = document.createElement("div");
    group.className = "month-group";
    group.dataset.month = month.month;

    const header = document.createElement("div");
    header.className = "month-header";
    header.textContent = month.month.slice(5) + " 月";
    const count = document.createElement("span");
    count.className = "month-count";
    count.textContent = `${month.count} 条`;
    header.appendChild(count);
    header.addEventListener("click", () => toggleGroup(group));
    group.appendChild(header);

    const days = document.createElement("div");
    days.className = "month-days";
    for (const day of month.days) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "date-item";
      item.dataset.date = day.date;
      const label = document.createElement("span");
      label.textContent = day.date.slice(8) + " 日";
      const dayCount = document.createElement("span");
      dayCount.className = "date-count";
      dayCount.textContent = day.count;
      item.appendChild(label);
      item.appendChild(dayCount);
      item.addEventListener("click", () => {
        if (onSelectDate(day.date)) setActiveDate(day.date);
      });
      days.appendChild(item);
    }
    group.appendChild(days);
    return group;
  }

  function toggleGroup(group) {
    group.classList.toggle("open");
  }

  // 选中高亮归位：清掉旧高亮，标记命中日期；日期不在时间轴上时不新增高亮
  function setActiveDate(dateStr) {
    for (const el of datesList.querySelectorAll(".date-item.active")) {
      el.classList.remove("active");
    }
    const item = datesList.querySelector(`.date-item[data-date="${dateStr}"]`);
    if (item) item.classList.add("active");
  }

  // 展开指定日期所在的年份与月份分组并标记选中，返回日期字符串；
  // 日期不在时间轴上时返回 null。搜索结果跳转等程序性定位使用。
  function revealDate(dateStr) {
    const monthGroup = datesList.querySelector(`.month-group[data-month="${dateStr.slice(0, 7)}"]`);
    if (!monthGroup) return null;
    const yearGroup = monthGroup.closest(".year-group");
    if (yearGroup && !yearGroup.classList.contains("open")) toggleGroup(yearGroup);
    if (!monthGroup.classList.contains("open")) toggleGroup(monthGroup);
    const dayItem = datesList.querySelector(`.date-item[data-date="${dateStr}"]`);
    if (dayItem) setActiveDate(dateStr);
    return dateStr;
  }

  // 展开时间轴上的第一天并标记选中，返回日期字符串；没有可用的日期项时返回 null。
  // 博主切换后的默认选中使用。
  function selectFirstDate() {
    const firstMonth = datesList.querySelector(".month-group");
    if (!firstMonth) return null;
    const firstYear = firstMonth.closest(".year-group");
    if (firstYear) firstYear.classList.add("open");
    toggleGroup(firstMonth);
    const firstDay = firstMonth.querySelector(".date-item");
    if (!firstDay) return null;
    setActiveDate(firstDay.dataset.date);
    return firstDay.dataset.date;
  }

  // 日期面板状态行（如同步完成后由博主模块写入提示）
  function setStatus(message) {
    showState(datesState, message);
  }

  return {loadDates, revealDate, selectFirstDate, setStatus};
}
