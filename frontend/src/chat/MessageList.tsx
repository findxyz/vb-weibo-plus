import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  compareMessages,
  fetchAttitudes,
  fetchEarlierMessages,
  fetchLatestMessages,
  fetchNewerMessages,
  HttpError,
  MESSAGE_PAGE_SIZE,
  nextAfterCursor,
  nextBeforeCursor,
  type Attitude,
  type ChatMessage,
  type MessageCursor,
} from './api';
import { STORAGE_KEYS } from '../shared/storage-keys';
import MessageItem from './MessageItem';
import ImageViewer, { type ImageSelection } from './ImageViewer';
import { trimMessageCache } from './message-cache';

const WINDOW_CHUNK = 60;
const KEEP_ABOVE = 180;
const KEEP_BELOW = 180;
const WINDOW_CAP = KEEP_ABOVE + KEEP_BELOW;
const ESTIMATED_HEIGHT = 96;
const GAP_HEIGHT = 16;
const LOAD_EARLIER_THRESHOLD = 120;
const FOLLOW_BOTTOM_THRESHOLD = 2;
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

type Props = {
  gid: number;
  admins: number[];
  refreshToken?: number;
  pollingEnabled?: boolean;
  onAuthExpired: () => void;
};

export default function MessageList({
  gid,
  admins,
  refreshToken = 0,
  pollingEnabled = true,
  onAuthExpired,
}: Props) {
  const [ordered, setOrdered] = useState<ChatMessage[]>([]);
  const [windowMids, setWindowMids] = useState<{ start: number; end: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [viewerImage, setViewerImage] = useState<ImageSelection | null>(null);
  const [newMessagesVisible, setNewMessagesVisible] = useState(false);
  const [announcement, setAnnouncement] = useState({ serial: 0, text: '' });
  const [following, setFollowing] = useState(false);
  const [attitudesEnabled, setAttitudesEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.CHAT_ATTITUDES) === '1',
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef(new Map<number, number>());
  const messagesRef = useRef(new Map<number, ChatMessage>());
  const cacheGenerationRef = useRef(0);
  const beforeCursorRef = useRef<MessageCursor | null>(null);
  const hasMoreRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const settleRef = useRef<{ boundary: ChatMessage } | null>(null);
  const pendingBottomRef = useRef<'once' | 'follow' | null>(null);
  const followingRef = useRef(false);
  const scrollPositionRef = useRef({ top: 0, height: 0 });
  const pendingAnchorRef = useRef<Anchor | null>(null);
  const pendingCompensationRef = useRef<{
    mids: number[];
    apply: boolean;
    estimated: number;
  } | null>(null);
  const pendingJumpRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const pendingScrollRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingCatchUpRef = useRef(false);
  const refreshingRef = useRef(false);
  const initializingRef = useRef(true);
  const pollFailuresRef = useRef(0);
  const attitudesEnabledRef = useRef(attitudesEnabled);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    initializingRef.current = true;
    setStatus('loading');
    setErrorText('');
    fetchLatestMessages(gid, MESSAGE_PAGE_SIZE, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        const items = page.items.toSorted(compareMessages);
        beforeCursorRef.current = nextBeforeCursor(page);
        hasMoreRef.current = page.hasMore;
        heightsRef.current.clear();
        messagesRef.current = new Map(items.map((message) => [message.mid, message]));
        setOrdered(items);
        if (items.length === 0) {
          setWindowMids(null);
        } else {
          showLatest(items, 'once');
        }
        setStatus('ready');
        void loadAttitudes(items);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof HttpError && error.status === 401) onAuthExpired();
        setStatus('error');
        setErrorText(error instanceof Error ? error.message : '消息加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) initializingRef.current = false;
      });
    return () => controller.abort();
  }, [gid]);

  useLayoutEffect(() => {
    attitudesEnabledRef.current = attitudesEnabled;
  }, [attitudesEnabled]);

  const indexByMid = useMemo(() => {
    const index = new Map<number, number>();
    ordered.forEach((message, position) => {
      index.set(message.mid, position);
    });
    return index;
  }, [ordered]);

  const startIndex = windowMids
    ? (indexByMid.get(windowMids.start) ?? Math.max(0, ordered.length - WINDOW_CAP))
    : 0;
  const endIndex = windowMids
    ? (indexByMid.get(windowMids.end) ?? ordered.length - 1)
    : ordered.length - 1;
  const adminIds = useMemo(() => new Set(admins), [admins]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const topSpacer = topSpacerRef.current;
    const bottomSpacer = bottomSpacerRef.current;
    if (!container || !topSpacer || !bottomSpacer) return;
    const heights = heightsRef.current;
    let resized = false;
    for (const element of container.querySelectorAll<HTMLElement>('[data-mid]')) {
      const mid = Number(element.dataset.mid);
      const height = element.offsetHeight;
      if (heights.has(mid) && heights.get(mid) !== height) resized = true;
      heights.set(mid, height);
    }
    topSpacer.style.height = `${sumHeights(heights, ordered.slice(0, startIndex))}px`;
    bottomSpacer.style.height = `${sumHeights(heights, ordered.slice(endIndex + 1))}px`;

    const anchor = pendingAnchorRef.current;
    if (anchor) {
      pendingAnchorRef.current = null;
      const element = container.querySelector<HTMLElement>(`[data-mid="${anchor.mid}"]`);
      if (element)
        setScrollTop(
          container,
          container.scrollTop + element.getBoundingClientRect().top - anchor.top,
        );
    }
    const compensation = pendingCompensationRef.current;
    if (compensation) {
      pendingCompensationRef.current = null;
      if (compensation.apply) {
        let measured = 0;
        for (const mid of compensation.mids) measured += messageHeight(heights, mid);
        setScrollTop(container, container.scrollTop + measured - compensation.estimated);
      }
    }
    const jumpIndex = pendingJumpRef.current;
    if (jumpIndex != null) {
      pendingJumpRef.current = null;
      const target = ordered[jumpIndex];
      const element = target && container.querySelector<HTMLElement>(`[data-mid="${target.mid}"]`);
      if (element) {
        setScrollTop(
          container,
          container.scrollTop +
            element.getBoundingClientRect().top -
            container.getBoundingClientRect().top,
        );
      }
    }
    const bottomRequest = pendingBottomRef.current;
    pendingBottomRef.current = null;
    if (bottomRequest === 'once' || (bottomRequest === 'follow' && followingRef.current)) {
      setScrollTop(container, container.scrollHeight);
      settleRef.current = ordered.length ? { boundary: ordered[ordered.length - 1] } : null;
      setNewMessagesVisible(false);
    } else if (resized && followingRef.current) {
      setScrollTop(container, container.scrollHeight);
    }
    if (scrollPositionRef.current.top === container.scrollTop) {
      scrollPositionRef.current.height = container.scrollHeight;
    }
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const mid = Number(element.dataset.mid);
        const height = element.offsetHeight;
        if (heightsRef.current.get(mid) === height) continue;
        heightsRef.current.set(mid, height);
        const message = messagesRef.current.get(mid);
        const settle = settleRef.current;
        if (
          followingRef.current ||
          (message && settle && compareMessages(message, settle.boundary) <= 0)
        ) {
          setScrollTop(container, container.scrollHeight);
        }
      }
    });
    for (const element of container.querySelectorAll<HTMLElement>('[data-mid]'))
      observer.observe(element);
    return () => observer.disconnect();
  });

  const workRef = useRef<() => void>(() => {});
  const refreshRef = useRef<() => Promise<boolean>>(async () => true);
  useLayoutEffect(() => {
    refreshRef.current = refreshOnce;
    workRef.current = () => {
      const container = containerRef.current;
      if (
        container &&
        newMessagesVisible &&
        !document.hidden &&
        container.scrollHeight - container.scrollTop - container.clientHeight < 80
      ) {
        setNewMessagesVisible(false);
      }
      void loadEarlierIfNeeded();
      shiftWindow();
    };
  });

  useEffect(() => {
    let stopped = false;
    let running = false;
    let wakePending = false;
    let timer = 0;
    const loop = async () => {
      if (stopped || !pollingEnabled) return;
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
      timer = window.setTimeout(
        loop,
        Math.min(POLL_BASE_MS * 2 ** pollFailuresRef.current, POLL_MAX_MS),
      );
    };
    const wake = () => {
      if (stopped) return;
      window.clearTimeout(timer);
      void loop();
    };
    if (pollingEnabled) timer = window.setTimeout(loop, POLL_BASE_MS);

    const onBlur = () => {
      settleRef.current = null;
      pendingCatchUpRef.current = true;
    };
    const onHidden = () => {
      onBlur();
      updateFollowing(false);
    };
    const onVisibility = () => {
      if (document.hidden) {
        onHidden();
      } else {
        wake();
      }
    };
    const onFocus = () => wake();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('focus', onFocus);
    };
  }, [pollingEnabled]);

  useEffect(() => {
    if (!refreshToken) return;
    void refreshOnce();
  }, [refreshToken]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const run = () => {
      const previous = scrollPositionRef.current;
      const top = container.scrollTop;
      const height = container.scrollHeight;
      scrollPositionRef.current = { top, height };
      const atBottom = height - top - container.clientHeight <= FOLLOW_BOTTOM_THRESHOLD;
      const leftBottom = followingRef.current && top < previous.top && !atBottom;
      if ((height === previous.height || leftBottom) && top !== previous.top && !document.hidden) {
        updateFollowing(top > previous.top && atBottom);
        if (!followingRef.current) settleRef.current = null;
      }
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

  function setScrollTop(container: HTMLElement, top: number) {
    container.scrollTop = top;
    scrollPositionRef.current = { top: container.scrollTop, height: container.scrollHeight };
  }

  useEffect(() => {
    const release = () => {
      settleRef.current = null;
    };
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
    const generation = cacheGenerationRef.current;
    try {
      const page = await fetchEarlierMessages(gid, MESSAGE_PAGE_SIZE, cursor, controller.signal);
      if (controller.signal.aborted || generation !== cacheGenerationRef.current) return;
      const items = page.items.toSorted(compareMessages);
      beforeCursorRef.current = items.length ? nextBeforeCursor(page) : null;
      hasMoreRef.current = items.length ? page.hasMore : false;
      if (!items.length) return;
      for (const message of items) messagesRef.current.set(message.mid, message);
      const anchor = captureAnchor(container);
      pendingAnchorRef.current = anchor;
      const merged = [...messagesRef.current.values()].sort(compareMessages);
      const anchorIndex = anchor ? merged.findIndex((message) => message.mid === anchor.mid) : 0;
      const { start, end } = windowBounds(anchorIndex < 0 ? 0 : anchorIndex, merged.length);
      setOrdered(merged);
      setWindowMids({ start: merged[start].mid, end: merged[end].mid });
      void loadAttitudes(items);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof HttpError && error.status === 401) onAuthExpired();
        else console.warn('加载更早消息失败：', error);
      }
    } finally {
      loadingEarlierRef.current = false;
    }
  }

  function loadEarlierIfNeeded() {
    const container = containerRef.current;
    if (!container || !hasMoreRef.current || loadingEarlierRef.current) return;
    if (!beforeCursorRef.current) return;
    if (container.scrollTop > LOAD_EARLIER_THRESHOLD) return;
    if (container.scrollHeight <= container.clientHeight) return;
    void loadEarlier();
  }

  function renderedElements(container: HTMLElement) {
    return [...container.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && Boolean(element.dataset.mid),
    );
  }

  function appendFresh(items: ChatMessage[]) {
    if (!items.length) return;
    const freshCount = items.filter((message) => !messagesRef.current.has(message.mid)).length;
    settleRef.current = null;
    for (const message of items) messagesRef.current.set(message.mid, message);
    const merged = [...messagesRef.current.values()].sort(compareMessages);
    const retained = trimMessageCache(merged, messagesRef.current, heightsRef.current);
    if (retained !== merged) {
      cacheGenerationRef.current += 1;
      beforeCursorRef.current = null;
      hasMoreRef.current = false;
      pendingCompensationRef.current = null;
      pendingJumpRef.current = null;
      const anchor = containerRef.current && captureAnchor(containerRef.current);
      pendingAnchorRef.current = anchor && messagesRef.current.has(anchor.mid) ? anchor : null;
      if (anchor && !pendingAnchorRef.current) pendingJumpRef.current = 0;
      setWindowMids((current) => {
        if (current && messagesRef.current.has(current.end)) {
          return {
            start: messagesRef.current.has(current.start) ? current.start : retained[0].mid,
            end: current.end,
          };
        }
        return {
          start: retained[0].mid,
          end: retained[Math.min(WINDOW_CAP, retained.length) - 1].mid,
        };
      });
    }
    setOrdered(retained);
    if (freshCount)
      setAnnouncement((previous) => ({
        serial: previous.serial + 1,
        text: `收到 ${freshCount} 条新消息`,
      }));
    setNewMessagesVisible(true);
    if (followingRef.current) showLatest(retained, 'follow');
    void loadAttitudes(items);
  }

  function applyAttitudes(result: Record<string, Attitude[]>) {
    let changed = false;
    for (const [mid, attitudes] of Object.entries(result)) {
      const message = messagesRef.current.get(Number(mid));
      if (!message) continue;
      messagesRef.current.set(Number(mid), {
        ...message,
        attitudes: Array.isArray(attitudes) ? attitudes : [],
      });
      changed = true;
    }
    if (changed) setOrdered([...messagesRef.current.values()].sort(compareMessages));
  }

  async function loadAttitudes(items: ChatMessage[]) {
    const controller = abortRef.current;
    if (!controller || !attitudesEnabledRef.current || !items.length) return;
    const mids = [...new Set(items.map((message) => message.mid))];
    try {
      const result = await fetchAttitudes(gid, mids, controller.signal);
      if (controller.signal.aborted) return;
      applyAttitudes(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof HttpError && error.status === 401) onAuthExpired();
        else console.warn('获取表态失败：', error);
      }
    }
  }

  function toggleAttitudes() {
    const next = !attitudesEnabled;
    attitudesEnabledRef.current = next;
    setAttitudesEnabled(next);
    localStorage.setItem(STORAGE_KEYS.CHAT_ATTITUDES, next ? '1' : '0');
    if (next) void loadAttitudes(ordered.slice(startIndex, endIndex + 1));
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
      const items = page.items.filter((message) => !messagesRef.current.has(message.mid));
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
    if (!controller || refreshingRef.current || initializingRef.current || document.hidden)
      return true;
    refreshingRef.current = true;
    try {
      if (pendingCatchUpRef.current) {
        const completed = await catchUp(controller.signal);
        if (completed) pendingCatchUpRef.current = false;
        return completed;
      }
      const page = await fetchLatestMessages(gid, MESSAGE_PAGE_SIZE, controller.signal);
      if (controller.signal.aborted) return true;
      const fresh = page.items.filter((message) => !messagesRef.current.has(message.mid));
      if (fresh.length) appendFresh(fresh);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof HttpError && error.status === 401) onAuthExpired();
        else console.warn('刷新消息失败：', error);
      }
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }

  function showLatest(all: ChatMessage[], request: 'once' | 'follow') {
    if (!all.length) return;
    const start = Math.max(0, all.length - WINDOW_CAP);
    setWindowMids({ start: all[start].mid, end: all[all.length - 1].mid });
    pendingBottomRef.current = request;
  }

  function updateFollowing(next: boolean) {
    if (followingRef.current === next) return;
    followingRef.current = next;
    setFollowing(next);
  }

  function jumpToLatest() {
    updateFollowing(true);
    showLatest(ordered, 'follow');
    void refreshOnce();
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
    const added =
      direction === 'up'
        ? ordered.slice(newStart, oldStart)
        : ordered.slice(oldEnd + 1, newEnd + 1);
    const apply =
      direction === 'up' ||
      bottomSpacerRef.current!.getBoundingClientRect().top <
        container.getBoundingClientRect().bottom;
    const anchor = captureAnchor(container);
    if (anchor) pendingAnchorRef.current = anchor;
    pendingCompensationRef.current = anchor
      ? null
      : {
          mids: added.map((message) => message.mid),
          apply,
          estimated: sumHeights(heightsRef.current, added),
        };
    setWindowMids({ start: ordered[newStart].mid, end: ordered[newEnd].mid });
  }

  return (
    <>
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        <span key={announcement.serial}>{announcement.text}</span>
      </span>
      <div className="messages" ref={containerRef}>
        <div className="list-spacer" ref={topSpacerRef} aria-hidden="true" />
        {status === 'loading' && (
          <p className="messages-state" role="status">
            正在加载消息……
          </p>
        )}
        {status === 'error' && (
          <p
            className="messages-state"
            role="alert"
          >{`消息加载失败，点击左侧群聊重试。（${errorText}）`}</p>
        )}
        {status === 'ready' && !ordered.length && (
          <p className="messages-state" role="status">
            这个群还没有本地消息。
          </p>
        )}
        {status === 'ready' &&
          ordered
            .slice(startIndex, endIndex + 1)
            .map((message) => (
              <MessageItem
                key={message.mid}
                message={message}
                isAdmin={adminIds.has(message.senderId)}
                onOpenImage={setViewerImage}
              />
            ))}
        <div className="list-spacer" ref={bottomSpacerRef} aria-hidden="true" />
      </div>
      <button
        type="button"
        className={`attitudes-toggle${attitudesEnabled ? ' active' : ''}`}
        aria-pressed={attitudesEnabled}
        aria-label={attitudesEnabled ? '表态已打开，随每次查询实时刷新' : '是否打开表态'}
        title={attitudesEnabled ? '表态已打开，随每次查询实时刷新' : '是否打开表态'}
        onClick={toggleAttitudes}
      >
        <span className="attitudes-toggle-icon" aria-hidden="true">
          👍
        </span>
        <svg className="attitudes-toggle-slash" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 4.5 19.5 19.5" />
        </svg>
      </button>
      <button
        type="button"
        className="scroll-bottom-button"
        aria-label="滚到最新消息"
        aria-description={following ? '正在跟随新消息' : undefined}
        title={following ? '正在跟随新消息' : '滚到最新消息并跟随'}
        data-following={following}
        onClick={jumpToLatest}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v12" />
          <path d="m6.5 10.5 5.5 5.5 5.5-5.5" />
          <path d="M5 20h14" />
        </svg>
      </button>
      <button
        type="button"
        className="new-messages-button"
        hidden={!newMessagesVisible}
        onClick={jumpToLatest}
      >
        有新消息
      </button>
      <ImageViewer
        selection={viewerImage}
        onChange={setViewerImage}
        onClose={() => setViewerImage(null)}
      />
    </>
  );
}
