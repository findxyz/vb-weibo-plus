import { useEffect, useRef, useState } from 'react';
import {
  fetchAnalyses, fetchAnalysis, streamAnalysis,
  type AnalysisPage, type AnalysisView, type ChatGroup,
} from './api';
import { groupName } from './display';
import { shanghaiToday } from '../../../src/main/resources/static/shared/date.js';

const PAGE_SIZE = 20;
const DEFAULT_PROMPT = '请总结今天群聊的主要讨论话题和参与者';

type Markdown = { render: (text: string) => string };

// marked 与 DOMPurify 惰性加载：首次打开分析窗口才拉取，加载失败允许下次重试。
let markdownPromise: Promise<Markdown> | null = null;
function loadMarkdown(): Promise<Markdown> {
  if (!markdownPromise) {
    markdownPromise = Promise.all([import('marked'), import('dompurify')])
      .then(([markedModule, purifyModule]) => ({
        render: (text: string) => purifyModule.default.sanitize(markedModule.marked.parse(text) as string),
      }))
      .catch(error => {
        markdownPromise = null;
        throw error;
      });
  }
  return markdownPromise;
}

function friendlyError(message: string) {
  const match = message.match(/\{[\s\S]*\}/);
  if (!match) return message;
  try {
    const detail = JSON.parse(match[0])?.error?.message;
    return detail ? message.slice(0, match.index) + detail : message;
  } catch {
    return message;
  }
}

type Props = {
  gid: number | null;
  group: ChatGroup | null;
  open: boolean;
  onClose: () => void;
};

export default function AnalysisDialog({ gid, group, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const copyRef = useRef<HTMLButtonElement>(null);
  const [date, setDate] = useState('');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AnalysisPage | null>(null);
  const [selected, setSelected] = useState<AnalysisView | null>(null);
  const [streamed, setStreamed] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [markdown, setMarkdown] = useState<Markdown | null>(null);

  function reset() {
    versionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setDate(shanghaiToday());
    setPrompt(DEFAULT_PROMPT);
    setScreen('list');
    setPage(1);
    setList(null);
    setSelected(null);
    setStreamed('');
    setAnalyzing(false);
    setDetailLoading(false);
    setFeedback('');
    setMarkdown(null);
    const version = versionRef.current;
    void loadMarkdown().then(libs => {
      if (version === versionRef.current) setMarkdown(libs);
    }).catch(() => {});
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reset();
      dialog.showModal();
      void loadList(1, versionRef.current);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      versionRef.current += 1;
      controllerRef.current?.abort();
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function loadList(nextPage: number, version = versionRef.current) {
    if (gid == null) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setPage(nextPage);
    setScreen('list');
    setFeedback('');
    try {
      const pageData = await fetchAnalyses(gid, nextPage, PAGE_SIZE, controller.signal);
      if (version !== versionRef.current) return;
      setList(pageData);
      if (!pageData.items.length) setFeedback('暂无历史分析记录。');
    } catch {
      if (version !== versionRef.current) return;
      setList(null);
      setFeedback('查询历史分析失败，请稍后重试。');
    }
  }

  async function openDetail(id: number) {
    const version = versionRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setScreen('detail');
    setSelected(null);
    setStreamed('');
    setDetailLoading(true);
    setFeedback('');
    try {
      await loadMarkdown();
      const view = await fetchAnalysis(id, controller.signal);
      if (version !== versionRef.current) return;
      setSelected(view);
    } catch {
      if (version !== versionRef.current) return;
      setFeedback('加载分析详情失败。');
    } finally {
      if (version === versionRef.current) setDetailLoading(false);
    }
  }

  function backToList() {
    versionRef.current += 1;
    controllerRef.current?.abort();
    setSelected(null);
    setStreamed('');
    setFeedback('');
    void loadList(page);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (gid == null || analyzing) return;
    const version = ++versionRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setScreen('detail');
    setSelected(null);
    setStreamed('');
    setDetailLoading(false);
    setFeedback('');
    setAnalyzing(true);
    let buffer = '';
    let timer = 0;
    const flush = () => {
      timer = 0;
      if (version === versionRef.current) setStreamed(buffer);
    };
    try {
      await loadMarkdown();
      const view = await streamAnalysis(gid, date, prompt, controller.signal, delta => {
        buffer += delta;
        if (!timer) timer = window.setTimeout(flush, 250);
      });
      if (timer) clearTimeout(timer);
      timer = 0;
      if (version !== versionRef.current) return;
      setStreamed(buffer);
      if (view) {
        setSelected(view);
        setStreamed('');
      } else {
        setFeedback('分析完成。');
      }
    } catch (error) {
      if (version !== versionRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`分析失败：${friendlyError(message)}`);
    } finally {
      if (version === versionRef.current) setAnalyzing(false);
    }
  }

  function download() {
    if (!selected) return;
    const header = `# 群聊分析报告\n\n- 分析日期：${selected.date}\n- 分析条数：${selected.messageCount} 条\n`
      + `- 分析时间：${selected.createdAt}\n- 提示词：${selected.prompt}\n\n---\n\n`;
    const blob = new Blob([header + selected.result], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `群聊分析_${selected.createdAt.replace(/[: ]/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt() {
    if (!selected) return;
    const button = copyRef.current;
    try {
      await navigator.clipboard.writeText(selected.prompt);
      if (button) button.textContent = '✅';
    } catch {
      if (button) button.textContent = '❌';
    }
    window.setTimeout(() => {
      if (copyRef.current) copyRef.current.textContent = '📋';
    }, 1500);
  }

  const pageCount = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const title = `群聊分析${group ? ` - ${groupName(group)}` : ''}`;
  const rendered = selected ? selected.result : streamed;

  return (
    <dialog ref={dialogRef} className="analysis-dialog" aria-labelledby="analysis-title">
      <div className="analysis-window">
        <header className="analysis-titlebar">
          <span aria-hidden="true">🤖</span>
          <h2 id="analysis-title">{title}</h2>
          <button type="button" className="analysis-close" aria-label="关闭群聊分析" onClick={onClose} />
        </header>
        <div className="analysis-layout">
          <form className="analysis-filters" onSubmit={submit}>
            <h3>分析条件</h3>
            <label htmlFor="analysis-date">分析日期</label>
            <input id="analysis-date" type="date" value={date}
              onChange={event => setDate(event.target.value)} />
            <label htmlFor="analysis-prompt">提示词</label>
            <textarea id="analysis-prompt" rows={6} value={prompt}
              onChange={event => setPrompt(event.target.value)} />
            <button type="submit" disabled={analyzing}>{analyzing ? '分析中…' : '🤖 分析'}</button>
          </form>
          <section className="analysis-content" aria-label="群聊分析结果">
            {screen === 'list' && (
              <>
                {list ? (
                  <div className="analysis-results">
                    <div className="analysis-results-list">
                      {list.items.map(item => (
                        <button key={item.id} type="button" className="analysis-item"
                          onClick={() => { void openDetail(item.id); }}>
                          <span className="analysis-item-date">{item.date}</span>
                          <span className="analysis-item-prompt" title={item.promptPreview}>{item.promptPreview}</span>
                          <span className="analysis-item-count">{`${item.messageCount} 条`}</span>
                          <span className="analysis-item-time">{item.createdAt}</span>
                        </button>
                      ))}
                    </div>
                    <footer className="analysis-pagination">
                      <button type="button" disabled={page <= 1}
                        onClick={() => { void loadList(page - 1); }}>⬅️ 上一页</button>
                      <span>{`第 ${list.page} / ${pageCount} 页，共 ${list.total} 条`}</span>
                      <button type="button" disabled={page >= pageCount}
                        onClick={() => { void loadList(page + 1); }}>下一页 ➡️</button>
                    </footer>
                  </div>
                ) : (
                  <div className="analysis-empty">{feedback || '设置分析条件后点击分析'}</div>
                )}
                {list && feedback && <div className="analysis-feedback" role="status">{feedback}</div>}
              </>
            )}
            {screen === 'detail' && (
              <div className="analysis-detail">
                <header className="analysis-detail-toolbar">
                  <button type="button" disabled={analyzing} onClick={backToList}>🚩 返回分析列表</button>
                  <button type="button" disabled={!selected || analyzing} onClick={download}>⬇️ 下载 Markdown</button>
                </header>
                {selected && (
                  <div className="analysis-detail-meta">
                    <span className="analysis-meta-field"><span className="analysis-meta-label">分析日期：</span>
                      <span className="analysis-meta-value">{selected.date}</span></span>
                    <span className="analysis-meta-field"><span className="analysis-meta-label">分析条数：</span>
                      <span className="analysis-meta-value">{`${selected.messageCount} 条`}</span></span>
                    <span className="analysis-meta-field"><span className="analysis-meta-label">分析时间：</span>
                      <span className="analysis-meta-value">{selected.createdAt}</span></span>
                    <span className="analysis-meta-field analysis-meta-prompt">
                      <span className="analysis-meta-label">提示词：</span>
                      <span className="analysis-meta-value" title={selected.prompt}>{selected.prompt}</span>
                      <button ref={copyRef} type="button" className="analysis-meta-copy" title="复制提示词"
                        onClick={() => { void copyPrompt(); }}>📋</button>
                    </span>
                  </div>
                )}
                <div className="analysis-detail-content">
                  {feedback
                    ? <div className="analysis-error" role="status">{feedback}</div>
                    : rendered
                      ? (markdown
                        ? <div dangerouslySetInnerHTML={{ __html: markdown.render(rendered) }} />
                        : <pre>{rendered}</pre>)
                      : <div className="analysis-pending">{detailLoading ? '正在加载…' : '正在分析，请稍候…'}</div>}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}
