import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  compareMessages, fetchEarlierMessages, fetchNewerMessages, HttpError, nextAfterCursor, nextBeforeCursor,
  queryHistoryMessages, syncHistory, type ChatGroup, type ChatMessage, type HistoryFilters,
  type HistoryPage, type MessageCursor,
} from './api';
import { calendarMonthsAgo, localDateValue, shanghaiToday, toQueryDateTime } from '../../../src/main/resources/static/shared/date.js';
import ImageViewer from './ImageViewer';
import MessageItem from './MessageItem';

const SEARCH_PAGE_SIZE = 20;
const CONTEXT_PAGE_SIZE = 50;
const LOAD_THRESHOLD = 120;

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

type Context = {
  messages: ChatMessage[];
  targetMid: number;
  before: MessageCursor | null;
  after: MessageCursor | null;
};

function historySummary(message: ChatMessage) {
  if (message.videoUrl || message.mediaType === 10
    || (message.mediaType === 13 && !(message.text ?? '').includes('收到红包消息'))) return '[视频]';
  if (message.mediaType === 14) return '[微博]';
  if (message.mediaType === 1 || message.previewUrl) return '[图片]';
  return message.text?.trim() || `[${message.msgTypeName || '消息'}]`;
}

// 关键词高亮：大小写不敏感，命中片段包进 <mark>，始终按文本节点渲染。
function Highlighted({ text, keyword }: { text: string; keyword?: string }) {
  const needle = keyword?.trim();
  if (!needle) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const nodes: ReactNode[] = [];
  let start = 0;
  let match = lowerText.indexOf(lowerNeedle);
  while (match >= 0) {
    if (match > start) nodes.push(text.slice(start, match));
    nodes.push(<mark key={match}>{text.slice(match, match + needle.length)}</mark>);
    start = match + needle.length;
    match = lowerText.indexOf(lowerNeedle, start);
  }
  if (start < text.length) nodes.push(text.slice(start));
  return <>{nodes}</>;
}

type Props = {
  gid: number | null;
  group: ChatGroup | null;
  open: boolean;
  onClose: () => void;
  onAuthExpired: () => void;
};

export default function HistoryDialog({ gid, group, open, onClose, onAuthExpired }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState<HistoryFilters>({ start: '', end: '', sender: '', keyword: '' });
  const [applied, setApplied] = useState<HistoryFilters | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryPage | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const [context, setContext] = useState<Context | null>(null);
  const [earlierState, setEarlierState] = useState('');
  const [newerState, setNewerState] = useState('');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [syncDate, setSyncDate] = useState('');
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const pendingAnchorRef = useRef<{ mid: number; top: number } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  function reset() {
    versionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const today = shanghaiToday();
    const anchor = new Date(`${today}T12:00:00`);
    setFilters({
      start: localDateValue(calendarMonthsAgo(anchor, 3)), end: today, sender: '', keyword: '',
    });
    setSyncDate(localDateValue(calendarMonthsAgo(anchor, 24)));
    setSyncing(false);
    setApplied(null);
    setPage(1);
    setResult(null);
    setStatus('idle');
    setFeedback('');
    setContext(null);
    setEarlierState('');
    setNewerState('');
    setViewerUrl(null);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reset();
      dialog.showModal();
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

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    pendingAnchorRef.current = null;
    const container = messagesRef.current;
    const element = container?.querySelector<HTMLElement>(`[data-mid="${anchor.mid}"]`);
    if (container && element) container.scrollTop += element.getBoundingClientRect().top - anchor.top;
  }, [context]);

  function ensureController() {
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController();
    }
    return controllerRef.current;
  }

  async function runQuery(nextPage: number, nextFilters: HistoryFilters) {
    if (gid == null) return;
    const controller = ensureController();
    const version = ++versionRef.current;
    setStatus('loading');
    setFeedback('');
    setApplied(nextFilters);
    setPage(nextPage);
    setContext(null);
    setViewerUrl(null);
    try {
      const pageData = await queryHistoryMessages(gid, nextFilters, nextPage, SEARCH_PAGE_SIZE, controller.signal);
      if (version !== versionRef.current || controller.signal.aborted) return;
      setResult(pageData);
      setStatus('idle');
      if (!pageData.items.length) setFeedback('没有符合条件的聊天记录');
    } catch (error) {
      if (version !== versionRef.current || controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) onAuthExpired();
      setResult(null);
      setStatus('error');
      setFeedback('聊天记录查询失败，请稍后重试。');
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void runQuery(1, filters);
  }

  async function runSync() {
    if (gid == null || syncing) return;
    if (!syncDate) {
      setFeedback('请先选择要同步到的历史日期。');
      return;
    }
    const controller = ensureController();
    const version = ++versionRef.current;
    setSyncing(true);
    setStatus('idle');
    setResult(null);
    setContext(null);
    setViewerUrl(null);
    setFeedback('');
    try {
      await syncHistory(gid, toQueryDateTime(syncDate) ?? `${syncDate} 00:00:00`, controller.signal);
      if (version !== versionRef.current || controller.signal.aborted) return;
      setFeedback('已开始同步更早的历史消息，稍后请手动刷新查看。');
    } catch (error) {
      if (version !== versionRef.current || controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) onAuthExpired();
      setFeedback('同步历史请求失败，请稍后重试。');
    } finally {
      setSyncing(false);
    }
  }

  function setEdges(before: MessageCursor | null, after: MessageCursor | null) {
    setEarlierState(before ? '向上滚动加载更早消息' : '没有更早消息');
    setNewerState(after ? '向下滚动加载更新消息' : '没有更新消息');
  }

  async function openContext(target: ChatMessage) {
    if (gid == null) return;
    const controller = ensureController();
    const version = ++versionRef.current;
    setContext({ messages: [target], targetMid: target.mid, before: null, after: null });
    setEarlierState('');
    setNewerState('');
    setFeedback('');
    try {
      const cursor: MessageCursor = { createdAt: target.createdAt, mid: target.mid };
      const [before, after] = await Promise.all([
        fetchEarlierMessages(gid, CONTEXT_PAGE_SIZE, cursor, controller.signal),
        fetchNewerMessages(gid, CONTEXT_PAGE_SIZE, cursor, controller.signal),
      ]);
      if (version !== versionRef.current || controller.signal.aborted) return;
      const beforeCursor = nextBeforeCursor(before);
      const afterCursor = nextAfterCursor(after);
      setContext({
        messages: [...before.items, target, ...after.items].sort(compareMessages),
        targetMid: target.mid,
        before: beforeCursor,
        after: afterCursor,
      });
      setEdges(beforeCursor, afterCursor);
      requestAnimationFrame(() => {
        const element = messagesRef.current?.querySelector<HTMLElement>(`[data-mid="${target.mid}"]`);
        element?.scrollIntoView({ block: 'center' });
      });
    } catch (error) {
      if (version !== versionRef.current || controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) onAuthExpired();
      setFeedback('消息上下文加载失败，请返回后重试。');
    }
  }

  function captureAnchor(container: HTMLElement) {
    const top = container.getBoundingClientRect().top;
    for (const element of container.children) {
      if (!(element instanceof HTMLElement) || !element.dataset.mid) continue;
      if (element.getBoundingClientRect().bottom > top) {
        return { mid: Number(element.dataset.mid), top: element.getBoundingClientRect().top };
      }
    }
    return null;
  }

  async function loadMore(direction: 'before' | 'after') {
    const current = context;
    const controller = controllerRef.current;
    if (!current || gid == null || !controller || loadingMoreRef.current) return;
    const cursor = direction === 'before' ? current.before : current.after;
    if (!cursor) return;
    loadingMoreRef.current = true;
    const version = versionRef.current;
    const container = messagesRef.current;
    const anchor = direction === 'before' && container ? captureAnchor(container) : null;
    try {
      const pageData = direction === 'before'
        ? await fetchEarlierMessages(gid, CONTEXT_PAGE_SIZE, cursor, controller.signal)
        : await fetchNewerMessages(gid, CONTEXT_PAGE_SIZE, cursor, controller.signal);
      if (version !== versionRef.current || controller.signal.aborted) return;
      const items = [...pageData.items].sort(compareMessages);
      const beforeCursor = direction === 'before' ? nextBeforeCursor(pageData) : current.before;
      const afterCursor = direction === 'after' ? nextAfterCursor(pageData) : current.after;
      pendingAnchorRef.current = anchor;
      setContext({
        messages: [...current.messages, ...items].sort(compareMessages),
        targetMid: current.targetMid,
        before: beforeCursor,
        after: afterCursor,
      });
      setEdges(beforeCursor, afterCursor);
    } catch (error) {
      if (version !== versionRef.current || controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) onAuthExpired();
      if (direction === 'before') setEarlierState('更早消息加载失败');
      else setNewerState('更新消息加载失败');
    } finally {
      loadingMoreRef.current = false;
    }
  }

  function handleScroll() {
    const container = messagesRef.current;
    if (!container || container.scrollHeight <= container.clientHeight) return;
    if (container.scrollTop <= LOAD_THRESHOLD) {
      void loadMore('before');
      return;
    }
    if (container.scrollHeight - container.scrollTop - container.clientHeight <= LOAD_THRESHOLD) {
      void loadMore('after');
    }
  }

  function backToResults() {
    versionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setContext(null);
    setViewerUrl(null);
    setFeedback('');
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE)) : 1;
  const admins = new Set(group?.admins ?? []);
  const title = `聊天记录${group ? ` - ${group.name || `群聊 ${group.gid}`}` : ''}`;
  const initialHint = !result && !context;

  return (
    <dialog ref={dialogRef} className="history-dialog" aria-labelledby="history-title">
      <div className="history-window">
        <header className="history-titlebar">
          <span aria-hidden="true">📜</span>
          <h2 id="history-title">{title}</h2>
          <button type="button" className="history-close" aria-label="关闭聊天记录" onClick={onClose} />
        </header>
        <div className="history-layout">
          <form className="history-filters" onSubmit={submit}>
            <h3>筛选条件</h3>
            <label htmlFor="history-start">开始日期</label>
            <input id="history-start" type="date" value={filters.start}
              onChange={event => setFilters({ ...filters, start: event.target.value })} />
            <label htmlFor="history-end">结束日期</label>
            <input id="history-end" type="date" value={filters.end}
              onChange={event => setFilters({ ...filters, end: event.target.value })} />
            <label htmlFor="history-sender">用户</label>
            <input id="history-sender" type="search" placeholder="精确昵称" value={filters.sender}
              onChange={event => setFilters({ ...filters, sender: event.target.value })} />
            <label htmlFor="history-keyword">内容</label>
            <input id="history-keyword" type="search" placeholder="包含关键词" value={filters.keyword}
              onChange={event => setFilters({ ...filters, keyword: event.target.value })} />
            <button type="submit" disabled={status === 'loading'}>🔍 查询</button>
            <label htmlFor="history-sync-time">同步历史至</label>
            <input id="history-sync-time" type="date" value={syncDate}
              onChange={event => setSyncDate(event.target.value)} />
            <button type="button" disabled={syncing} onClick={() => { void runSync(); }}>⬇️ 同步历史</button>
          </form>
          <section className="history-content" aria-label="聊天记录查询结果">
            {initialHint && (
              <div className="history-empty">
                {syncing ? '同步中…' : status === 'loading' ? '查询中…' : (feedback || '设置筛选条件后点击查询')}
              </div>
            )}
            {result && !context && (
              <div className="history-results">
                <div className="history-results-list">
                  {result.items.map(message => (
                    <button key={message.mid} type="button" className="history-result"
                      onClick={() => { void openContext(message); }}>
                      <span className="history-result-time">{dateTimeFormatter.format(new Date(message.createdAt))}</span>
                      <span className="history-result-sender">{message.senderName || '未知成员'}</span>
                      <span className="history-result-summary">
                        <Highlighted text={historySummary(message)} keyword={applied?.keyword} />
                      </span>
                    </button>
                  ))}
                </div>
                <footer className="history-pagination">
                  <button type="button" disabled={page <= 1}
                    onClick={() => { void runQuery(page - 1, applied ?? filters); }}>⬅️ 上一页</button>
                  <span>{`第 ${result.page} / ${pageCount} 页，共 ${result.total} 条`}</span>
                  <button type="button" disabled={page >= pageCount}
                    onClick={() => { void runQuery(page + 1, applied ?? filters); }}>下一页 ➡️</button>
                </footer>
              </div>
            )}
            {context && (
              <div className="history-context">
                <header className="history-context-toolbar">
                  <button type="button" onClick={backToResults}>🚩 返回搜索结果</button>
                </header>
                <div className="history-messages-shell">
                  <div className="history-edge-state" role="status">{earlierState}</div>
                  <div className="history-messages" ref={messagesRef} onScroll={handleScroll}>
                    {context.messages.map(message => (
                      <MessageItem key={message.mid} message={message} isAdmin={admins.has(message.senderId)}
                        highlighted={message.mid === context.targetMid} onOpenImage={setViewerUrl} />
                    ))}
                  </div>
                  <div className="history-edge-state" role="status">{newerState}</div>
                </div>
              </div>
            )}
            {feedback && (result || context) && <div className="history-feedback" role="status">{feedback}</div>}
          </section>
        </div>
      </div>
      <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
    </dialog>
  );
}
