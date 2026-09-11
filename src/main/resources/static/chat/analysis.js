export function createAnalysis({
  elements: {
    analysisDialog, analysisOpen, analysisClose, analysisTitle, analysisForm,
    analysisDate, analysisPrompt, analysisSubmit, analysisBack, analysisDownload,
    analysisEmpty, analysisFeedback, analysisResults, analysisList, analysisPageState,
    analysisPrev, analysisNext, analysisDetail, analysisDetailMeta, analysisDetailContent
  },
  fetchJson, localDateValue}) {
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
    analysisList.replaceChildren();
    analysisPageState.textContent = "";
    analysisResults.hidden = true;
    analysisDetail.hidden = true;
    analysisEmpty.hidden = false;
    analysisEmpty.textContent = "设置分析条件后点击分析";
    analysisFeedback.textContent = "";
    analysisSubmit.disabled = false;
    analysisSubmit.textContent = "🤖 分析";
    analysisBack.disabled = false;
    analysisDownload.disabled = true;
  }

  function resetForOpen() {
    cancelOperation();
    state.sessionVersion += 1;
    state.page = 1;
    state.total = 0;
    analysisDate.value = localDateValue(new Date());
    analysisPrompt.value = "请总结今天群聊的主要讨论话题和参与者";
    resetView();
  }

  // marked 与 DOMPurify 改为首次打开分析弹窗时动态加载，首页不再预载；
  // 加载失败时清空缓存 promise 允许下次重试，renderMarkdown 自身降级为纯文本
  let markdownLibsPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`脚本加载失败：${src}`));
      document.head.append(script);
    });
  }
  function ensureMarkdownLibs() {
    if (!markdownLibsPromise) {
      markdownLibsPromise = Promise.all([
        loadScript("marked.min.js"),
        loadScript("dompurify.min.js")
      ]).catch(error => {
        markdownLibsPromise = null;
        throw error;
      });
    }
    return markdownLibsPromise;
  }

  function renderMarkdown(text) {
    const html = window.marked ? window.marked.parse(text) : text;
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  }

  function friendlyErrorMessage(message) {
    const match = message.match(/\{[\s\S]*\}/);
    if (!match) return message;
    try {
      const detail = JSON.parse(match[0])?.error?.message;
      return detail ? message.slice(0, match.index) + detail : message;
    } catch {
      return message;
    }
  }

  function renderMeta(view) {
    const meta = analysisDetailMeta;
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
    analysisList.replaceChildren(...items.map(item => {
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
    analysisPageState.textContent =
      `第 ${state.page} / ${pageCount} 页，共 ${state.total} 条`;
    analysisPrev.disabled = state.page <= 1;
    analysisNext.disabled = state.page >= pageCount;
    analysisEmpty.hidden = true;
    analysisDetail.hidden = true;
    analysisResults.hidden = false;
    analysisList.scrollTop = 0;
  }

  async function queryList(page, sessionVersion = state.sessionVersion) {
    const operationVersion = ++state.operationVersion;
    const params = new URLSearchParams({
      gid: String(state.gid), page: String(page), size: String(state.size)
    });
    analysisEmpty.hidden = true;
    analysisDetail.hidden = true;
    try {
      const result = await fetchJson(`/chat/analyses?${params}`, {cache: "no-store"});
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.page = result.page;
      state.total = result.total;
      renderResults(result.items, sessionVersion);
      analysisFeedback.textContent = result.items.length ? "" : "暂无历史分析记录。";
    } catch {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      analysisResults.hidden = true;
      analysisFeedback.textContent = "查询历史分析失败，请稍后重试。";
    }
  }

  async function loadDetail(id, sessionVersion = state.sessionVersion) {
    const operationVersion = ++state.operationVersion;
    analysisResults.hidden = true;
    analysisDetail.hidden = false;
    analysisBack.disabled = false;
    analysisFeedback.textContent = "";
    analysisDetailMeta.hidden = true;
    analysisDownload.disabled = true;
    analysisDetailContent.innerHTML = '<div class="analysis-pending">正在加载…</div>';
    try {
      await ensureMarkdownLibs();
      const result = await fetchJson(`/chat/analyses/${id}`, {cache: "no-store"});
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.currentView = result;
      renderMeta(result);
      analysisDownload.disabled = false;
      analysisDetailContent.innerHTML = renderMarkdown(result.result);
      analysisDetailContent.scrollTop = 0;
    } catch {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      analysisFeedback.textContent = "加载分析详情失败。";
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
    analysisSubmit.disabled = true;
    analysisSubmit.textContent = "分析中…";
    analysisBack.disabled = true;
    analysisEmpty.hidden = true;
    analysisResults.hidden = true;
    analysisDetail.hidden = false;
    analysisDetailMeta.hidden = true;
    analysisDownload.disabled = true;
    analysisDetailContent.innerHTML = '<div class="analysis-pending">正在分析，请稍候…</div>';
    analysisFeedback.textContent = "";
    let streamed = "";
    let renderScheduled = false;
    const renderStream = () => {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      analysisDetailContent.innerHTML = renderMarkdown(streamed);
      analysisDetailContent.scrollTop = analysisDetailContent.scrollHeight;
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
      // 库未就绪时在这里等待，按钮已处于「分析中…」禁用态，用户可感知
      await ensureMarkdownLibs();
      const params = new URLSearchParams({
        gid: String(state.gid), date: analysisDate.value,
        prompt: analysisPrompt.value
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
        analysisDownload.disabled = false;
        analysisDetailContent.innerHTML = renderMarkdown(doneView.result);
        analysisDetailContent.scrollTop = 0;
      } else {
        analysisFeedback.textContent = "分析完成。";
        renderStream();
      }
    } catch (error) {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      analysisResults.hidden = true;
      analysisDetail.hidden = false;
      const notice = document.createElement("div");
      notice.className = "analysis-error";
      notice.textContent = `分析失败：${friendlyErrorMessage(error.message)}`;
      analysisDetailContent.replaceChildren(notice);
    } finally {
      if (!isCurrent(sessionVersion, operationVersion)) return;
      state.reader = null;
      state.controller = null;
      analysisSubmit.disabled = false;
      analysisSubmit.textContent = "🤖 分析";
      analysisBack.disabled = false;
    }
  }

  function close() {
    cancelOperation();
    state.sessionVersion += 1;
    if (analysisDialog.open) analysisDialog.close();
  }

  function open() {
    if (!state.gid) return;
    resetForOpen();
    analysisDialog.showModal();
    queryList(1);
    // 预热 markdown 库：用户填提示词的功夫多半已加载完成
    ensureMarkdownLibs().catch(() => {});
  }

  function setGroup(group) {
    cancelOperation();
    state.sessionVersion += 1;
    state.gid = group.gid;
    analysisTitle.textContent = `群聊分析 - ${group.name || `群聊 ${group.gid}`}`;
    analysisOpen.disabled = false;
  }

  analysisOpen.addEventListener("click", open);
  analysisClose.addEventListener("click", close);
  analysisForm.addEventListener("submit", event => {
    event.preventDefault();
    submit();
  });
  analysisPrev.addEventListener("click", () => queryList(state.page - 1));
  analysisNext.addEventListener("click", () => queryList(state.page + 1));
  analysisBack.addEventListener("click", () => {
    cancelOperation();
    state.currentView = null;
    analysisDetail.hidden = true;
    analysisFeedback.textContent = "";
    analysisResults.hidden = false;
    queryList(state.page);
  });
  analysisDownload.addEventListener("click", () => {
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
