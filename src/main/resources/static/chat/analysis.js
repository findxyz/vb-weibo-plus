export function createAnalysis({elements, fetchJson, localDateValue}) {
  const state = {
    gid: null,
    page: 1,
    total: 0,
    size: 20,
    sessionVersion: 0,
    operationVersion: 0,
    currentView: null,
    reader: null,
    controller: null,
    renderFrame: null
  };

  function isCurrent(sessionVersion, operationVersion = null) {
    return sessionVersion === state.sessionVersion
      && (operationVersion === null || operationVersion === state.operationVersion);
  }

  function cancelOperation() {
    state.operationVersion += 1;
    state.controller?.abort();
    state.controller = null;
    state.reader?.cancel().catch(() => {});
    state.reader = null;
    if (state.renderFrame !== null) {
      cancelAnimationFrame(state.renderFrame);
      state.renderFrame = null;
    }
  }

  function resetView() {
    state.currentView = null;
    elements.analysisList.replaceChildren();
    elements.analysisPageState.textContent = "";
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = true;
    elements.analysisEmpty.hidden = false;
    elements.analysisEmpty.textContent = "设置分析条件后点击分析";
    elements.analysisFeedback.textContent = "";
    elements.analysisSubmit.disabled = false;
    elements.analysisSubmit.textContent = "🤖 分析";
    elements.analysisBack.disabled = false;
    elements.analysisDownload.disabled = true;
  }

  function resetForOpen() {
    cancelOperation();
    state.sessionVersion += 1;
    state.page = 1;
    state.total = 0;
    elements.analysisDate.value = localDateValue(new Date());
    elements.analysisPrompt.value = "请总结今天群聊的主要讨论话题和参与者";
    resetView();
  }

  function renderMarkdown(text) {
    const html = window.marked ? window.marked.parse(text) : text;
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  }

  function renderMeta(view) {
    const meta = elements.analysisDetailMeta;
    meta.replaceChildren();
    const fields = [
      {label: "分析日期", value: view.date},
      {label: "分析条数", value: view.messageCount != null ? `${view.messageCount} 条` : ""},
      {label: "分析时间", value: view.createdAt}
    ];
    for (const field of fields) {
      if (!field.value) continue;
      const item = document.createElement("span");
      item.className = "analysis-meta-field";
      const label = document.createElement("span");
      label.className = "analysis-meta-label";
      label.textContent = `${field.label}：`;
      const value = document.createElement("span");
      value.className = "analysis-meta-value";
      value.textContent = field.value;
      item.append(label, value);
      meta.append(item);
    }
    if (view.prompt) {
      const item = document.createElement("span");
      item.className = "analysis-meta-field analysis-meta-prompt";
      const label = document.createElement("span");
      label.className = "analysis-meta-label";
      label.textContent = "提示词：";
      const value = document.createElement("span");
      value.className = "analysis-meta-value";
      value.textContent = view.prompt;
      value.title = view.prompt;
      const copyButton = document.createElement("button");
      copyButton.className = "analysis-meta-copy";
      copyButton.type = "button";
      copyButton.textContent = "📋";
      copyButton.title = "复制提示词";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(view.prompt);
          copyButton.textContent = "✅";
        } catch {
          copyButton.textContent = "❌";
        }
        setTimeout(() => { copyButton.textContent = "📋"; }, 1500);
      });
      item.append(label, value, copyButton);
      meta.append(item);
    }
    meta.hidden = meta.children.length === 0;
  }

  function renderResults(items, sessionVersion) {
    elements.analysisList.replaceChildren(...items.map(item => {
      const row = document.createElement("button");
      row.className = "analysis-item";
      row.type = "button";
      const date = document.createElement("span");
      date.className = "analysis-item-date";
      date.textContent = item.date;
      const prompt = document.createElement("span");
      prompt.className = "analysis-item-prompt";
      prompt.textContent = item.promptPreview || "";
      if (item.promptPreview) prompt.title = item.promptPreview;
      const count = document.createElement("span");
      count.className = "analysis-item-count";
      count.textContent = `${item.messageCount} 条`;
      const time = document.createElement("span");
      time.className = "analysis-item-time";
      time.textContent = item.createdAt;
      row.append(date, prompt, count, time);
      row.addEventListener("click", () => loadDetail(item.id, sessionVersion));
      return row;
    }));
    const pageCount = Math.max(1, Math.ceil(state.total / state.size));
    elements.analysisPageState.textContent =
      `第 ${state.page} / ${pageCount} 页，共 ${state.total} 条`;
    elements.analysisPrev.disabled = state.page <= 1;
    elements.analysisNext.disabled = state.page >= pageCount;
    elements.analysisEmpty.hidden = true;
    elements.analysisDetail.hidden = true;
    elements.analysisResults.hidden = false;
    elements.analysisList.scrollTop = 0;
  }

  async function queryList(page, sessionVersion = state.sessionVersion) {
    const operationVersion = ++state.operationVersion;
    const params = new URLSearchParams({
      gid: String(state.gid), page: String(page), size: String(state.size)
    });
    elements.analysisEmpty.hidden = true;
    elements.analysisDetail.hidden = true;
    try {
      const result = await fetchJson(`/chat/analyses?${params}`, {cache: "no-store"});
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.page = result.page;
      state.total = result.total;
      renderResults(result.items, sessionVersion);
      elements.analysisFeedback.textContent = result.items.length ? "" : "暂无历史分析记录。";
    } catch {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      elements.analysisResults.hidden = true;
      elements.analysisFeedback.textContent = "查询历史分析失败，请稍后重试。";
    }
  }

  async function loadDetail(id, sessionVersion = state.sessionVersion) {
    const operationVersion = ++state.operationVersion;
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = false;
    elements.analysisBack.disabled = false;
    elements.analysisFeedback.textContent = "";
    elements.analysisDetailMeta.hidden = true;
    elements.analysisDownload.disabled = true;
    elements.analysisDetailContent.innerHTML = '<div class="analysis-pending">正在加载…</div>';
    try {
      const result = await fetchJson(`/chat/analyses/${id}`, {cache: "no-store"});
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.currentView = result;
      renderMeta(result);
      elements.analysisDownload.disabled = false;
      elements.analysisDetailContent.innerHTML = renderMarkdown(result.result);
      elements.analysisDetailContent.scrollTop = 0;
    } catch {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      elements.analysisFeedback.textContent = "加载分析详情失败。";
    }
  }

  function parseSseEvent(block) {
    let event = "message";
    const dataLines = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    return dataLines.length ? {event, data: dataLines.join("\n")} : null;
  }

  async function submit() {
    const sessionVersion = state.sessionVersion;
    const operationVersion = ++state.operationVersion;
    state.controller = new AbortController();
    elements.analysisSubmit.disabled = true;
    elements.analysisSubmit.textContent = "分析中…";
    elements.analysisBack.disabled = true;
    elements.analysisEmpty.hidden = true;
    elements.analysisResults.hidden = true;
    elements.analysisDetail.hidden = false;
    elements.analysisDetailMeta.hidden = true;
    elements.analysisDownload.disabled = true;
    elements.analysisDetailContent.innerHTML = '<div class="analysis-pending">正在分析，请稍候…</div>';
    elements.analysisFeedback.textContent = "";
    let streamed = "";
    let renderScheduled = false;
    const renderStream = () => {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      elements.analysisDetailContent.innerHTML = renderMarkdown(streamed);
      elements.analysisDetailContent.scrollTop = elements.analysisDetailContent.scrollHeight;
    };
    const scheduleRender = () => {
      if (renderScheduled || !isCurrent(sessionVersion, operationVersion)) return;
      renderScheduled = true;
      state.renderFrame = requestAnimationFrame(() => {
        renderScheduled = false;
        state.renderFrame = null;
        renderStream();
      });
    };
    try {
      const params = new URLSearchParams({
        gid: String(state.gid), date: elements.analysisDate.value,
        prompt: elements.analysisPrompt.value
      });
      const response = await fetch("/chat/analyses/stream", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: params,
        signal: state.controller.signal
      });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.msg || `HTTP ${response.status}`);
      }
      state.reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let doneView = null;
      for (;;) {
        const {value, done} = await state.reader.read();
        if (done) break;
        buffer += value;
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop();
        for (const block of blocks) {
          const parsed = parseSseEvent(block);
          if (!parsed) continue;
          if (parsed.event === "delta") {
            streamed += parsed.data;
            scheduleRender();
          } else if (parsed.event === "done") {
            doneView = JSON.parse(parsed.data);
          } else if (parsed.event === "error") {
            throw new Error(parsed.data);
          }
        }
      }
      if (!isCurrent(sessionVersion, operationVersion)) return;
      if (doneView) {
        if (state.renderFrame !== null) {
          cancelAnimationFrame(state.renderFrame);
          state.renderFrame = null;
        }
        renderScheduled = false;
        state.currentView = doneView;
        renderMeta(doneView);
        elements.analysisDownload.disabled = false;
        elements.analysisDetailContent.innerHTML = renderMarkdown(doneView.result);
        elements.analysisDetailContent.scrollTop = 0;
      } else {
        elements.analysisFeedback.textContent = "分析完成。";
        renderStream();
      }
    } catch (error) {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      elements.analysisDetail.hidden = true;
      elements.analysisResults.hidden = false;
      if (error.name !== "AbortError") elements.analysisFeedback.textContent = `分析失败：${error.message}`;
    } finally {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.reader = null;
      state.controller = null;
      elements.analysisSubmit.disabled = false;
      elements.analysisSubmit.textContent = "🤖 分析";
      elements.analysisBack.disabled = false;
    }
  }

  function close() {
    cancelOperation();
    state.sessionVersion += 1;
    if (elements.analysisDialog.open) elements.analysisDialog.close();
  }

  function open() {
    if (!state.gid) return;
    resetForOpen();
    elements.analysisDialog.showModal();
    queryList(1);
  }

  function setGroup(group) {
    cancelOperation();
    state.sessionVersion += 1;
    state.gid = group.gid;
    elements.analysisTitle.textContent = `群聊分析 - ${group.name || `群聊 ${group.gid}`}`;
    elements.analysisOpen.disabled = false;
  }

  elements.analysisOpen.addEventListener("click", open);
  elements.analysisClose.addEventListener("click", close);
  elements.analysisForm.addEventListener("submit", event => {
    event.preventDefault();
    submit();
  });
  elements.analysisPrev.addEventListener("click", () => queryList(state.page - 1));
  elements.analysisNext.addEventListener("click", () => queryList(state.page + 1));
  elements.analysisBack.addEventListener("click", () => {
    cancelOperation();
    state.currentView = null;
    elements.analysisDetail.hidden = true;
    elements.analysisFeedback.textContent = "";
    elements.analysisResults.hidden = false;
    queryList(state.page);
  });
  elements.analysisDownload.addEventListener("click", () => {
    if (!state.currentView) return;
    const view = state.currentView;
    const header = `# 群聊分析报告\n\n- 分析日期：${view.date}\n- 分析条数：${view.messageCount} 条\n- 分析时间：${view.createdAt}\n- 提示词：${view.prompt}\n\n---\n\n`;
    const blob = new Blob([header + view.result], {type: "text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `群聊分析_${view.createdAt.replace(/[: ]/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  });

  return {open, close, setGroup};
}
