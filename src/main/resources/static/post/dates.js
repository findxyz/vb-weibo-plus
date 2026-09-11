// 日期时间轴：年 → 月 → 日三级折叠，点某天进入当日微博列表。
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
      item.addEventListener("click", () => onSelectDate(day.date, item));
      days.appendChild(item);
    }
    group.appendChild(days);
    return group;
  }

  function toggleGroup(group) {
    group.classList.toggle("open");
  }

  return {loadDates, toggleGroup};
}
