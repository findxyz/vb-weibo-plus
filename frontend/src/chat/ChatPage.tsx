import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STORAGE_KEYS } from '../../../src/main/resources/static/shared/storage-keys.js';
import Avatar from './Avatar';
import AnalysisDialog from './AnalysisDialog';
import Composer from './Composer';
import GroupList from './GroupList';
import HistoryDialog from './HistoryDialog';
import MessageList from './MessageList';
import { fetchGroups, fetchLoginStatus, startQrLogin as requestQrLogin } from './api';
import { groupMemberCount, groupName } from './display';

export default function ChatPage() {
  const [loginExpired, setLoginExpired] = useState(false);
  const groupsQuery = useQuery({
    queryKey: ['chat', 'groups'],
    queryFn: ({ signal }) => fetchGroups(signal),
    staleTime: Infinity,
    refetchOnMount: false,
    // 与消息轮询同节奏；页面隐藏或登录失效时暂停，回到页面时由 focus 立即刷新一次。
    refetchInterval: loginExpired ? false : 1000,
    refetchIntervalInBackground: false,
  });
  const { refetch } = groupsQuery;
  const groups = groupsQuery.data ?? [];

  useEffect(() => {
    const onFocus = () => { void refetch(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const [selectedGid, setSelectedGid] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEYS.CHAT_LAST_GROUP));
    return Number.isSafeInteger(saved) && saved > 0 ? saved : null;
  });
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
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
      try {
        const result = await fetchLoginStatus(controller.signal);
        if (qrPendingRef.current) return;
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
      <header className="titlebar"><h1>{title}</h1></header>
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
        <section className="conversation">
          {selectedGroup ? (
            <header className="group-header">
              <Avatar className="main-group-avatar" name={selectedGroup.name} avatar={selectedGroup.avatar} />
              <div className="group-summary">
                <div className="group-title-line">
                  <h2>{groupName(selectedGroup)}</h2>
                </div>
                <p className="group-number">
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
              />
            ) : (
              <p className="messages-state">{groupsQuery.isPending ? '正在加载群聊……' : '暂无群聊。'}</p>
            )}
          </div>
          <Composer gid={selectedGroup?.gid ?? null} onSent={() => setRefreshToken(value => value + 1)}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenAnalysis={() => setAnalysisOpen(true)} />
        </section>
      </div>
      <HistoryDialog gid={selectedGroup?.gid ?? null} group={selectedGroup} open={historyOpen}
        onClose={() => setHistoryOpen(false)} />
      <AnalysisDialog gid={selectedGroup?.gid ?? null} group={selectedGroup} open={analysisOpen}
        onClose={() => setAnalysisOpen(false)} />
    </div>
  );
}
