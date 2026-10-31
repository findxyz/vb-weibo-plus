import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

type LikeState = { liked: boolean; count: number };

export default function PostLikeButton({ mblogId, enabled, session, onUnauthorized }: {
  mblogId: string; enabled: boolean; session: number; onUnauthorized: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [visible, setVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const queryKey = ['post', 'like', session, mblogId];
  const params = new URLSearchParams({ mblogId });
  const state = useQuery({
    queryKey, enabled: enabled && visible,
    staleTime: Infinity, gcTime: Infinity,
    queryFn: ({ signal }) => getJson<LikeState>(`/post/like?${params}`, signal, 15000, { cache: 'no-store' }),
  });
  const confirmed = state.isError ? undefined : state.data;

  useEffect(() => {
    const button = buttonRef.current!;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { root: button.closest('.posts') });
    observer.observe(button.closest('.post-card')!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (isUnauthorized(state.error)) onUnauthorized(); }, [state.error, onUnauthorized]);
  useEffect(() => () => controller.current?.abort(), []);

  async function click() {
    if (!enabled || processing || state.isFetching) return;
    setMessage('');
    if (!confirmed) { await state.refetch(); return; }
    setProcessing(true);
    const request = new AbortController();
    controller.current = request;
    const target = !confirmed.liked;
    let failure: unknown;
    let checked: LikeState | undefined;
    try {
      checked = await getJson<LikeState>('/post/like', request.signal, 15000, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ mblogId, liked: String(target) }),
      });
    } catch (error) {
      failure = error;
    }
    if (request.signal.aborted) return;
    if (isUnauthorized(failure)) {
      onUnauthorized();
      setProcessing(false);
      return;
    }
    if (failure) {
      const result = await state.refetch();
      checked = result.isError ? undefined : result.data;
    } else if (checked) client.setQueryData(queryKey, checked);
    if (request.signal.aborted) return;
    if (!checked) {
      setMessage('操作结果尚未确认，请重试查询点赞状态。');
    } else if (checked.liked !== target) {
      setMessage(failure instanceof Error ? failure.message : '微博尚未确认状态变更，请稍后重试。');
    }
    setProcessing(false);
  }

  const label = processing ? '处理中…' : state.isFetching ? '查询中…'
    : !confirmed ? '状态未知，重试' : confirmed.liked ? '已赞' : '点赞';
  const name = processing ? '正在处理点赞' : state.isFetching ? '正在查询点赞状态'
    : !confirmed ? '重试查询点赞状态' : confirmed.liked ? '取消点赞' : '点赞';
  return <div className="post-like">
    <button ref={buttonRef} type="button" className="post-like-button" aria-label={name}
      aria-pressed={confirmed?.liked} disabled={!enabled} aria-disabled={processing || state.isFetching}
      onClick={() => void click()} title={confirmed?.liked ? '取消点赞' : undefined}>
      <span aria-hidden="true">👍</span>{label}
    </button>
    {confirmed && <span className="post-like-count" aria-label={`当前点赞数：${confirmed.count}`}>{confirmed.count}</span>}
    {(message || state.isError) && <span className="post-like-error" role="status">
      {message || `点赞状态查询失败：${state.error?.message}`}
    </span>}
  </div>;
}
