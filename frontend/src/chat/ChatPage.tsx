import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STORAGE_KEYS } from '../shared/storage-keys.js';
import Avatar from './Avatar';
import AnalysisDialog from './AnalysisDialog';
import Composer from './Composer';
import DreamLauncher from './DreamLauncher';
import GroupList from './GroupList';
import HistoryDialog from './HistoryDialog';
import MessageList from './MessageList';
import { fetchGroups, fetchLoginStatus, HttpError, startQrLogin as requestQrLogin } from './api';
import { groupMemberCount, groupName } from './display';
import weiboLogo from '../shared/assets/weibo-logo.svg';

export default function ChatPage() {
  const [loginExpired, setLoginExpired] = useState(false);
  const loginVersionRef = useRef(0);
  const groupFailuresRef = useRef(0);
  const markLoginExpired = useCallback(() => {
    loginVersionRef.current += 1;
    setLoginExpired(true);
  }, []);
  const groupsQuery = useQuery({
    queryKey: ['chat', 'groups'],
    queryFn: async ({ signal }) => {
      try {
        const result = await fetchGroups(signal);
        groupFailuresRef.current = 0;
        return result;
      } catch (error) {
        if (!signal.aborted) {
          groupFailuresRef.current = Math.min(groupFailuresRef.current + 1, 5);
          if (error instanceof HttpError && error.status === 401) markLoginExpired();
        }
        throw error;
      }
    },
    staleTime: Infinity,
    refetchOnMount: false,
    // 失败按秒指数退避，封顶 30 秒；隐藏或登录失效时暂停，成功后恢复 1 秒。
    refetchInterval: () => loginExpired ? false : Math.min(1000 * 2 ** groupFailuresRef.current, 30000),
    refetchIntervalInBackground: false,
  });
  const { refetch } = groupsQuery;
  const groups = groupsQuery.data ?? [];

  useEffect(() => {
    const onFocus = () => { if (!loginExpired) void refetch(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch, loginExpired]);

  const [selectedGid, setSelectedGid] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEYS.CHAT_LAST_GROUP));
    return Number.isSafeInteger(saved) && saved > 0 ? saved : null;
  });
  const [reloadToken, setReloadToken] = useState(0);
  const selectedGidRef = useRef(selectedGid);
  useLayoutEffect(() => { selectedGidRef.current = selectedGid; }, [selectedGid]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [immersive, setImmersive] = useState(
    () => localStorage.getItem(STORAGE_KEYS.CHAT_IMMERSIVE) === '1',
  );
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CHAT_IMMERSIVE, immersive ? '1' : '0');
  }, [immersive]);
  const [qrPending, setQrPending] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState('');
  const [qrError, setQrError] = useState('');
  const qrPendingRef = useRef(false);
  const qrImageRef = useRef<string | null>(null);
  const firstTimerRef = useRef(0);
  const imageTimerRef = useRef(0);
  const qrControllerRef = useRef<AbortController | null>(null);
  const statusControllerRef = useRef<AbortController | null>(null);
  const checkStatusRef = useRef<() => void>(() => {});

  // 登录检测：进入页面一次，之后每 180 秒一次；扫码中或页面隐藏时跳过。
  useEffect(() => {
    const controller = new AbortController();
    statusControllerRef.current = controller;
    const check = async () => {
      const version = loginVersionRef.current;
      try {
        const result = await fetchLoginStatus(controller.signal);
        if (controller.signal.aborted || qrPendingRef.current || version !== loginVersionRef.current) return;
        setLoginExpired(result.valid !== true);
      } catch {
        // 登录检测失败不打扰用户。
      }
    };
    checkStatusRef.current = () => { void check(); };
    void check();
    const timer = window.setInterval(() => {
      if (!document.hidden && !qrPendingRef.current) void check();
    }, 180_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => () => {
    qrControllerRef.current?.abort();
    clearTimeout(firstTimerRef.current);
    clearInterval(imageTimerRef.current);
  }, []);

  useEffect(() => {
    if (!groups.length) return;
    if (selectedGid == null || !groups.some(group => group.gid === selectedGid)) {
      setSelectedGid(groups[0].gid);
    }
  }, [groups, selectedGid]);

  useEffect(() => {
    if (selectedGid != null) localStorage.setItem(STORAGE_KEYS.CHAT_LAST_GROUP, String(selectedGid));
  }, [selectedGid]);

  const selectedGroup = groups.find(group => group.gid === selectedGid) ?? null;
  const title = selectedGroup ? `微博群聊 - ${groupName(selectedGroup)}` : '微博群聊';

  // 消息数变化时让「+ N」闪一次：换 key 重新挂载以重启动画，切群时不闪。
  const lastSizeRef = useRef<{ gid: number; count: number } | null>(null);
  const [flashNonce, setFlashNonce] = useState(0);
  useEffect(() => {
    if (!selectedGroup || typeof selectedGroup.messageCount !== 'number') return;
    const previous = lastSizeRef.current;
    lastSizeRef.current = { gid: selectedGroup.gid, count: selectedGroup.messageCount };
    if (!previous || previous.gid !== selectedGroup.gid) return;
    if (previous.count !== selectedGroup.messageCount) setFlashNonce(value => value + 1);
  }, [selectedGroup]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // 重复点击当前群也重新载入并落底，与旧页「选群即重新打开」一致。
  function selectGroup(gid: number) {
    setHistoryOpen(false);
    setAnalysisOpen(false);
    setSelectedGid(gid);
    setReloadToken(token => token + 1);
  }

  const memberMeta = selectedGroup ? groupMemberCount(selectedGroup) : '';
  const messageCount = selectedGroup && typeof selectedGroup.messageCount === 'number'
    ? selectedGroup.messageCount : null;

  function stopQrTimers(clearImage: boolean) {
    clearTimeout(firstTimerRef.current);
    clearInterval(imageTimerRef.current);
    firstTimerRef.current = 0;
    imageTimerRef.current = 0;
    if (clearImage) {
      qrImageRef.current = null;
      setQrImage(null);
      setQrLoading('');
    } else if (!qrImageRef.current) {
      setQrLoading('暂无二维码');
    }
  }

  function refreshQrImage() {
    const preload = new Image();
    preload.onload = () => {
      if (!qrPendingRef.current) return;
      qrImageRef.current = preload.src;
      setQrImage(preload.src);
      setQrLoading('');
    };
    preload.onerror = () => {
      if (!qrPendingRef.current || qrImageRef.current) return;
      setQrLoading('二维码加载重试…');
    };
    preload.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }

  async function startQrLogin() {
    if (qrPendingRef.current) return;
    qrPendingRef.current = true;
    setQrPending(true);
    setQrError('');
    setQrLoading('正在获取二维码…');
    qrImageRef.current = null;
    setQrImage(null);
    firstTimerRef.current = window.setTimeout(refreshQrImage, 3000);
    imageTimerRef.current = window.setInterval(refreshQrImage, 10_000);
    const controller = new AbortController();
    qrControllerRef.current = controller;
    let succeeded = false;
    try {
      await requestQrLogin(controller.signal);
      succeeded = true;
      loginVersionRef.current += 1;
      setLoginExpired(false);
      await refetch();
      setReloadToken(token => token + 1);
      checkStatusRef.current();
    } catch {
      if (!controller.signal.aborted) setQrError('扫码登录失败，请重新扫码。');
    } finally {
      qrPendingRef.current = false;
      setQrPending(false);
      stopQrTimers(succeeded);
    }
  }

  const loginPanel = loginExpired ? (
    <div className="login-expired" role="status">
      {qrImage
        ? <img src={qrImage} alt="扫码登录二维码" />
        : qrLoading && <div className="qr-loading">{qrLoading}</div>}
      <span className="panel-state">登录已失效</span>
      {qrError && <span className="panel-state">{qrError}</span>}
      <button type="button" disabled={qrPending} onClick={() => { void startQrLogin(); }}>
        {qrPending ? '📱 扫码中…' : '📱 扫码登录'}
      </button>
    </div>
  ) : null;

  return (
    <div className="app">
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <header className="titlebar">
        <span className="title-logo" aria-hidden="true"><img src={weiboLogo} alt="" /></span>
        <h1>{title}</h1>
        <div className="window-controls">
          <button type="button" className="window-control immersive" aria-pressed={immersive}
            aria-label={immersive ? '退出沉浸阅读' : '进入沉浸阅读'}
            title={immersive ? '退出沉浸阅读' : '进入沉浸阅读'}
            onClick={() => setImmersive(value => !value)} />
          <a className="window-control toggle" href="/post/index.html"
            aria-label="切换到本地微博" title="切换到本地微博" />
        </div>
      </header>
      <div className="workspace">
        <GroupList
          groups={groups}
          selectedGid={selectedGid}
          pending={groupsQuery.isPending}
          failed={groupsQuery.isError && !groupsQuery.data}
          onSelect={selectGroup}
          onRetry={() => { void groupsQuery.refetch(); }}
          footer={loginPanel}
        />
        <section className={`conversation${immersive ? ' immersive' : ''}`}>
          {selectedGroup ? (
            <header className="group-header">
              <Avatar className="main-group-avatar" name={selectedGroup.name} avatar={selectedGroup.avatar} />
              <div className="group-summary">
                <div className="group-title-line">
                  <h2>{groupName(selectedGroup)}</h2>
                </div>
                <p className="group-number">群号：{selectedGroup.gid}</p>
                <p className="group-size">
                  {memberMeta}
                  {messageCount != null && (
                    <>
                      {' + '}
                      <span key={flashNonce}
                        className={`current-message-count${flashNonce ? ' size-flash' : ''}`}>{messageCount}</span>
                      {' 条消息'}
                    </>
                  )}
                </p>
              </div>
            </header>
          ) : (
            <header className="group-header empty-header">
              <p className="group-number">{groupsQuery.isPending ? '正在加载群聊……' : '选择左侧群聊查看消息'}</p>
            </header>
          )}
          <div className="messages-shell">
            {selectedGroup ? (
              <MessageList
                key={`${selectedGroup.gid}-${reloadToken}`}
                gid={selectedGroup.gid}
                admins={selectedGroup.admins ?? []}
                refreshToken={refreshToken}
                pollingEnabled={!loginExpired}
                onAuthExpired={markLoginExpired}
              />
            ) : (
              <p className="messages-state">{groupsQuery.isPending ? '正在加载群聊……' : '暂无群聊。'}</p>
            )}
          </div>
          <Composer gid={selectedGroup?.gid ?? null} onSent={gid => {
            if (gid === selectedGidRef.current) setRefreshToken(value => value + 1);
          }} onAuthExpired={markLoginExpired}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenAnalysis={() => setAnalysisOpen(true)} />
        </section>
      </div>
      <HistoryDialog gid={selectedGroup?.gid ?? null} group={selectedGroup} open={historyOpen}
        onClose={() => setHistoryOpen(false)} onAuthExpired={markLoginExpired} />
      <AnalysisDialog gid={selectedGroup?.gid ?? null} group={selectedGroup} open={analysisOpen}
        onClose={() => setAnalysisOpen(false)} onAuthExpired={markLoginExpired} />
      <DreamLauncher gid={selectedGroup?.gid ?? null} />
    </div>
  );
}
