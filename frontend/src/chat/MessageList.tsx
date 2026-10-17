import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  compareMessages, fetchEarlierMessages, fetchLatestMessages, fetchNewerMessages, MESSAGE_PAGE_SIZE,
  nextAfterCursor, nextBeforeCursor, type ChatMessage, type MessageCursor,
} from './api';
import MessageItem from './MessageItem';
import ImageViewer from './ImageViewer';

// 窗口尺寸取自旧 sessions.js：DOM 只保留视口上下各约 180 条，视口外按估算高度占位。
const WINDOW_CHUNK = 60;
const KEEP_ABOVE = 180;
const KEEP_BELOW = 180;
const WINDOW_CAP = KEEP_ABOVE + KEEP_BELOW;
const ESTIMATED_HEIGHT = 96;
const GAP_HEIGHT = 16;
const LOAD_EARLIER_THRESHOLD = 120;
const POLL_BASE_MS = 1000;
const POLL_MAX_MS = 30000;

type Anchor = { mid: number; top: number };

function messageHeight(heights: Map<number, number>, mid: number) {
  return (heights.get(mid) ?? ESTIMATED_HEIGHT) + GAP_HEIGHT;
}

function sumHeights(heights: Map<number, number>, messages: ChatMessage[]) {
  let sum = 0;
  for (const message of messages) sum += messageHeight(heights, message.mid);
  return sum;
}

function mergeOlder(previous: ChatMessage[], items: ChatMessage[]) {
  const merged = new Map<number, ChatMessage>();
  for (const message of [...items, ...previous]) merged.set(message.mid, message);
  return [...merged.values()].sort(compareMessages);
}

export default function MessageList({ gid, admins }: { gid: number; admins: number[] }) {
  const [ordered, setOrdered] = useState<ChatMessage[]>([]);
  const [windowMids, setWindowMids] = useState<{ start: number; end: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [newMessagesVisible, setNewMessagesVisible] = useState(false);
  const [bottomRequest, setBottomRequest] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef(new Map<number, number>());
  const messagesRef = useRef(new Map<number, ChatMessage>());
  const beforeCursorRef = useRef<MessageCursor | null>(null);
  const hasMoreRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const settleRef = useRef<{ boundary: ChatMessage } | null>(null);
  const pendingBottomRef = useRef(false);
  const pendingAnchorRef = useRef<Anchor | null>(null);
  const pendingCompensationRef = useRef<{ mids: number[]; apply: boolean; estimated: number } | null>(null);
  const pendingJumpRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const pendingScrollRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingCatchUpRef = useRef(false);
  const refreshingRef = useRef(false);
  const initializingRef = useRef(true);
  const pollFailuresRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    initializingRef.current = true;
    setStatus('loading');
    setErrorText('');
    fetchLatestMessages(gid, MESSAGE_PAGE_SIZE, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      const items = [...page.items].sort(compareMessages);
      beforeCursorRef.current = nextBeforeCursor(page);
      hasMoreRef.current = page.hasMore;
      heightsRef.current.clear();
      messagesRef.current = new Map(items.map(message => [message.mid, message]));
      setOrdered(items);
      if (items.length === 0) {
        setWindowMids(null);
      } else {
        const start = Math.max(0, items.length - WINDOW_CAP);
        setWindowMids({ start: items[start].mid, end: items[items.length - 1].mid });
        pendingBottomRef.current = true;
      }
      setStatus('ready');
    }).catch(error => {
      if (controller.signal.aborted) return;
      setStatus('error');
      setErrorText(error instanceof Error ? error.message : '消息加载失败');
    }).finally(() => {
      if (!controller.signal.aborted) initializingRef.current = false;
    });
    return () => controller.abort();
  }, [gid]);

  const indexByMid = useMemo(() => {
    const index = new Map<number, number>();
    ordered.forEach((message, position) => index.set(message.mid, position));
    return index;
  }, [ordered]);

  const startIndex = windowMids
    ? indexByMid.get(windowMids.start) ?? Math.max(0, ordered.length - WINDOW_CAP) : 0;
  const endIndex = windowMids ? indexByMid.get(windowMids.end) ?? ordered.length - 1 : ordered.length - 1;
  const adminIds = useMemo(() => new Set(admins), [admins]);

  // 渲染后同步实测高度与占位高度，再处理落底、翻页锚点、窗口补偿和跳转。
  useLayoutEffect(() => {
    const container = containerRef.current;
    const topSpacer = topSpacerRef.current;
    const bottomSpacer = bottomSpacerRef.current;
    if (!container || !topSpacer || !bottomSpacer) return;
    const heights = heightsRef.current;
    for (const element of container.querySelectorAll<HTMLElement>('[data-mid]')) {
      heights.set(Number(element.dataset.mid), element.offsetHeight);
    }
    topSpacer.style.height = `${sumHeights(heights, ordered.slice(0, startIndex))}px`;
    bottomSpacer.style.height = `${sumHeights(heights, ordered.slice(endIndex + 1))}px`;

    if (pendingBottomRef.current) {
      pendingBottomRef.current = false;
      container.scrollTop = container.scrollHeight;
      settleRef.current = ordered.length ? { boundary: ordered[ordered.length - 1] } : null;
    }
    const anchor = pendingAnchorRef.current;
    if (anchor) {
      pendingAnchorRef.current = null;
      const element = container.querySelector<HTMLElement>(`[data-mid="${anchor.mid}"]`);
      if (element) container.scrollTop += element.getBoundingClientRect().top - anchor.top;
    }
    const compensation = pendingCompensationRef.current;
    if (compensation) {
      pendingCompensationRef.current = null;
      if (compensation.apply) {
        let measured = 0;
        for (const mid of compensation.mids) measured += messageHeight(heights, mid);
        container.scrollTop += measured - compensation.estimated;
      }
    }
    const jumpIndex = pendingJumpRef.current;
    if (jumpIndex != null) {
      pendingJumpRef.current = null;
      const target = ordered[jumpIndex];
      const element = target && container.querySelector<HTMLElement>(`[data-mid="${target.mid}"]`);
      if (element) {
        container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      }
    }
  });

  // 图片晚于落底加载完成时只补收尾内的撑高；用户一旦输入就不再移动视口。
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const mid = Number(element.dataset.mid);
        const height = element.offsetHeight;
        if (heightsRef.current.get(mid) === height) continue;
        heightsRef.current.set(mid, height);
        const message = messagesRef.current.get(mid);
        const settle = settleRef.current;
        if (message && settle && compareMessages(message, settle.boundary) <= 0) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });
    for (const element of container.querySelectorAll<HTMLElement>('[data-mid]')) observer.observe(element);
    return () => observer.disconnect();
  });

  // 一次性落底：提示与滚底按钮共用，落底后重新进入收尾。
  useLayoutEffect(() => {
    if (!bottomRequest) return;
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    settleRef.current = ordered.length ? { boundary: ordered[ordered.length - 1] } : null;
  }, [bottomRequest]);

  const workRef = useRef<() => void>(() => {});
  const refreshRef = useRef<() => Promise<boolean>>(async () => true);
  useLayoutEffect(() => {
    refreshRef.current = refreshOnce;
    workRef.current = () => {
      const container = containerRef.current;
      if (container && newMessagesVisible && !document.hidden
        && container.scrollHeight - container.scrollTop - container.clientHeight < 80) {
        setNewMessagesVisible(false);
      }
      void loadEarlierIfNeeded();
      shiftWindow();
    };
  });

  // 轮询当前群；失败按 1 秒起指数退避封顶 30 秒，成功后归零。
  useEffect(() => {
    let stopped = false;
    let running = false;
    let wakePending = false;
    let timer = 0;
    const loop = async () => {
      if (stopped) return;
      if (running) {
        wakePending = true;
        return;
      }
      running = true;
      const ok = await refreshRef.current();
      running = false;
      if (stopped) return;
      pollFailuresRef.current = ok ? 0 : Math.min(pollFailuresRef.current + 1, 5);
      if (wakePending) {
        wakePending = false;
        void loop();
        return;
      }
      timer = window.setTimeout(loop, Math.min(POLL_BASE_MS * 2 ** pollFailuresRef.current, POLL_MAX_MS));
    };
    const wake = () => {
      if (stopped) return;
      window.clearTimeout(timer);
      void loop();
    };
    timer = window.setTimeout(loop, POLL_BASE_MS);

    const onVisibility = () => {
      if (document.hidden) {
        settleRef.current = null;
        pendingCatchUpRef.current = true;
      } else {
        wake();
      }
    };
    const onBlur = () => {
      settleRef.current = null;
      pendingCatchUpRef.current = true;
    };
    const onFocus = () => wake();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const run = () => {
      if (frameRef.current) {
        pendingScrollRef.current = true;
        return;
      }
      workRef.current();
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        if (pendingScrollRef.current) {
          pendingScrollRef.current = false;
          workRef.current();
        }
      });
    };
    container.addEventListener('scroll', run);
    return () => {
      container.removeEventListener('scroll', run);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    // 页面内任一用户输入都结束落底收尾，包括在侧栏或页面其它区域的操作。
    const release = () => { settleRef.current = null; };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const name of events) window.addEventListener(name, release, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, release);
    };
  }, []);

  function captureAnchor(container: HTMLElement): Anchor | null {
    const containerTop = container.getBoundingClientRect().top;
    for (const element of renderedElements(container)) {
      if (element.getBoundingClientRect().bottom > containerTop) {
        return { mid: Number(element.dataset.mid), top: element.getBoundingClientRect().top };
      }
    }
    return null;
  }

  async function loadEarlier() {
    const container = containerRef.current;
    const controller = abortRef.current;
    const cursor = beforeCursorRef.current;
    if (!container || !controller || !cursor || loadingEarlierRef.current) return;
    loadingEarlierRef.current = true;
    try {
      const page = await fetchEarlierMessages(gid, MESSAGE_PAGE_SIZE, cursor, controller.signal);
      if (controller.signal.aborted) return;
      const items = [...page.items].sort(compareMessages);
      beforeCursorRef.current = items.length ? nextBeforeCursor(page) : null;
      hasMoreRef.current = items.length ? page.hasMore : false;
      if (!items.length) return;
      for (const message of items) messagesRef.current.set(message.mid, message);
      // 锚点在插入前一刻采集，避免请求期间窗口滑动把旧位置当成插入基准；
      // 新拉到的更早消息纳入窗口，保证刚翻到的内容可见，同时不越过 360 条上限。
      const anchor = captureAnchor(container);
      pendingAnchorRef.current = anchor;
      const merged = mergeOlder(ordered, items);
      const anchorIndex = anchor ? merged.findIndex(message => message.mid === anchor.mid) : 0;
      const { start, end } = windowBounds(anchorIndex < 0 ? 0 : anchorIndex, merged.length);
      setOrdered(merged);
      setWindowMids({ start: merged[start].mid, end: merged[end].mid });
    } catch (error) {
      if (!controller.signal.aborted) console.warn('加载更早消息失败：', error);
    } finally {
      loadingEarlierRef.current = false;
    }
  }

  function loadEarlierIfNeeded() {
    const container = containerRef.current;
    if (!container || !hasMoreRef.current || loadingEarlierRef.current) return;
    if (!beforeCursorRef.current) return;
    if (container.scrollTop > LOAD_EARLIER_THRESHOLD) return;
    // 内容不足一屏时没有「更早」可翻，避免与落底互相触发。
    if (container.scrollHeight <= container.clientHeight) return;
    void loadEarlier();
  }

  function renderedElements(container: HTMLElement) {
    return [...container.children].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && Boolean(element.dataset.mid));
  }

  // 新消息只追加、不移动视口；到达即结束落底收尾，旧图片随后加载也不能把视口拉回底部。
  function appendFresh(items: ChatMessage[]) {
    if (!items.length) return;
    settleRef.current = null;
    for (const message of items) messagesRef.current.set(message.mid, message);
    setOrdered([...messagesRef.current.values()].sort(compareMessages));
    setNewMessagesVisible(true);
  }

  async function catchUp(signal: AbortSignal) {
    let newest: ChatMessage | null = null;
    for (const message of messagesRef.current.values()) {
      if (!newest || compareMessages(message, newest) > 0) newest = message;
    }
    if (!newest) return true;
    let cursor: MessageCursor = { createdAt: newest.createdAt, mid: newest.mid };
    for (;;) {
      if (document.hidden || signal.aborted) return false;
      const page = await fetchNewerMessages(gid, MESSAGE_PAGE_SIZE, cursor, signal);
      if (signal.aborted) return false;
      const items = page.items.filter(message => !messagesRef.current.has(message.mid));
      if (items.length) appendFresh(items);
      const next = nextAfterCursor(page);
      if (!next) break;
      if (next.mid === cursor.mid && next.createdAt === cursor.createdAt) break;
      cursor = next;
    }
    return true;
  }

  async function refreshOnce() {
    const controller = abortRef.current;
    if (!controller || refreshingRef.current || initializingRef.current || document.hidden) return true;
    refreshingRef.current = true;
    try {
      if (pendingCatchUpRef.current) {
        const completed = await catchUp(controller.signal);
        if (completed) pendingCatchUpRef.current = false;
        return completed;
      }
      const page = await fetchLatestMessages(gid, MESSAGE_PAGE_SIZE, controller.signal);
      if (controller.signal.aborted) return true;
      const fresh = page.items.filter(message => !messagesRef.current.has(message.mid));
      if (fresh.length) appendFresh(fresh);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) console.warn('刷新消息失败：', error);
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }

  // 提示与右下角按钮同一动作：先刷新一次，再一次性落底并收起提示。
  async function jumpToLatest() {
    await refreshOnce();
    const all = [...messagesRef.current.values()].sort(compareMessages);
    if (!all.length) return;
    const start = Math.max(0, all.length - WINDOW_CAP);
    setWindowMids({ start: all[start].mid, end: all[all.length - 1].mid });
    setNewMessagesVisible(false);
    setBottomRequest(value => value + 1);
  }

  function countAbove(elements: HTMLElement[], top: number) {
    let count = 0;
    for (const element of elements) {
      if (element.getBoundingClientRect().bottom > top) break;
      count += 1;
    }
    return count;
  }

  function countBelow(elements: HTMLElement[], bottom: number) {
    let count = 0;
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      if (elements[index].getBoundingClientRect().top < bottom) break;
      count += 1;
    }
    return count;
  }

  // 滚动离开已渲染区间时按估算高度一次定位到目标附近，避免逐批物化沿途内容。
  function shiftWindow() {
    const container = containerRef.current;
    const topSpacer = topSpacerRef.current;
    const bottomSpacer = bottomSpacerRef.current;
    if (!container || !topSpacer || !bottomSpacer || !ordered.length || document.hidden) return;
    const elements = renderedElements(container);
    if (!elements.length) return;
    const rect = container.getBoundingClientRect();
    const first = elements[0];
    const last = elements[elements.length - 1];

    if (startIndex > 0 && first.getBoundingClientRect().top >= rect.bottom) {
      jumpToIndex(findIndexAtViewport(topSpacer, 0, startIndex, rect.top));
      return;
    }
    if (endIndex < ordered.length - 1 && last.getBoundingClientRect().bottom <= rect.top) {
      jumpToIndex(findIndexAtViewport(bottomSpacer, endIndex + 1, ordered.length, rect.top));
      return;
    }
    if (countAbove(elements, rect.top) < KEEP_ABOVE / 2 && startIndex > 0) {
      expandWindow('up');
      return;
    }
    if (countBelow(elements, rect.bottom) < KEEP_BELOW / 2 && endIndex < ordered.length - 1) {
      expandWindow('down');
    }
  }

  function findIndexAtViewport(spacer: HTMLElement, from: number, to: number, viewportTop: number) {
    const heights = heightsRef.current;
    let y = spacer.getBoundingClientRect().top;
    for (let index = from; index < to; index += 1) {
      const height = messageHeight(heights, ordered[index].mid);
      if (y + height >= viewportTop) return index;
      y += height;
    }
    return Math.max(from, to - 1);
  }

  // 以某条消息为中心夹取窗口：保留上方 180 条上下文，总数不超过 360 条。
  function windowBounds(center: number, length: number) {
    const start = Math.max(0, Math.min(center - KEEP_ABOVE, length - WINDOW_CAP));
    return { start, end: Math.min(length - 1, start + WINDOW_CAP - 1) };
  }

  function jumpToIndex(target: number) {
    const container = containerRef.current;
    if (!container) return;
    const { start, end } = windowBounds(target, ordered.length);
    pendingJumpRef.current = target;
    setWindowMids({ start: ordered[start].mid, end: ordered[end].mid });
  }

  function expandWindow(direction: 'up' | 'down') {
    const container = containerRef.current;
    if (!container) return;
    const oldStart = startIndex;
    const oldEnd = endIndex;
    let newStart = oldStart;
    let newEnd = oldEnd;
    if (direction === 'up') {
      newStart = Math.max(0, oldStart - WINDOW_CHUNK);
      if (newEnd - newStart + 1 > WINDOW_CAP) newEnd = newStart + WINDOW_CAP - 1;
    } else {
      newEnd = Math.min(ordered.length - 1, oldEnd + WINDOW_CHUNK);
      if (newEnd - newStart + 1 > WINDOW_CAP) newStart = newEnd - WINDOW_CAP + 1;
    }
    const added = direction === 'up'
      ? ordered.slice(newStart, oldStart)
      : ordered.slice(oldEnd + 1, newEnd + 1);
    const apply = direction === 'up'
      || bottomSpacerRef.current!.getBoundingClientRect().top < container.getBoundingClientRect().bottom;
    pendingCompensationRef.current = {
      mids: added.map(message => message.mid),
      apply,
      estimated: sumHeights(heightsRef.current, added),
    };
    setWindowMids({ start: ordered[newStart].mid, end: ordered[newEnd].mid });
  }

  return (
    <>
      <div className="messages" ref={containerRef}>
        <div className="list-spacer" ref={topSpacerRef} aria-hidden="true" />
        {status === 'loading' && <p className="messages-state" role="status">正在加载消息……</p>}
        {status === 'error' && (
          <p className="messages-state" role="alert">{`消息加载失败，点击左侧群聊重试。（${errorText}）`}</p>
        )}
        {status === 'ready' && !ordered.length && (
          <p className="messages-state" role="status">这个群还没有本地消息。</p>
        )}
        {status === 'ready' && ordered.slice(startIndex, endIndex + 1).map(message => (
          <MessageItem key={message.mid} message={message} isAdmin={adminIds.has(message.senderId)}
            onOpenImage={setViewerUrl} />
        ))}
        <div className="list-spacer" ref={bottomSpacerRef} aria-hidden="true" />
      </div>
      <button type="button" className="scroll-bottom-button" aria-label="滚到最新消息"
        onClick={() => { void jumpToLatest(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v12" />
          <path d="m6.5 10.5 5.5 5.5 5.5-5.5" />
          <path d="M5 20h14" />
        </svg>
      </button>
      <button type="button" className="new-messages-button" hidden={!newMessagesVisible}
        onClick={() => { void jumpToLatest(); }}>有新消息</button>
      <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
    </>
  );
}
