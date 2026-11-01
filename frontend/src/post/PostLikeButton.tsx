import { useEffect, useRef, useState } from 'react';
import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

type LikeState = { liked: boolean; count: number };

export default function PostLikeButton({ mblogId, enabled, session, onUnauthorized }: {
  mblogId: string; enabled: boolean; session: number; onUnauthorized: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [visible, setVisible] = useState(false);
  const client = useQueryClient();
  const queryKey = ['post', 'like', session, mblogId];
  const params = new URLSearchParams({ mblogId });
  const processing = useIsMutating({ mutationKey: queryKey, exact: true }) > 0;
  const load = ({ signal }: { signal: AbortSignal }) =>
    getJson<LikeState>(`/post/like?${params}`, signal, 15000, { cache: 'no-store' });
  const state = useQuery({
    queryKey, enabled: enabled && visible,
    staleTime: Infinity, gcTime: Infinity,
    queryFn: load,
  });
  const confirmed = state.isError ? undefined : state.data;
  const latest = useMutationState({
    filters: { mutationKey: queryKey, exact: true },
    select: mutation => ({ status: mutation.state.status, error: mutation.state.error }),
  }).at(-1);
  const message = !processing && latest?.status === 'error' ? latest.error?.message : '';
  const operation = useMutation({
    mutationKey: queryKey, retry: false,
    onMutate: target => {
      client.setQueryData<LikeState>(queryKey, current => {
        if (!current || current.liked === target) return current;
        return { liked: target, count: Math.max(0, current.count + (target ? 1 : -1)) };
      });
    },
    mutationFn: (target: boolean) => getJson<void>('/post/like', new AbortController().signal, 15000, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ mblogId, liked: String(target) }),
    }),
    onError: error => {
      if (mounted.current && isUnauthorized(error)) onUnauthorized();
    },
  });

  useEffect(() => {
    const button = buttonRef.current!;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { root: button.closest('.posts') });
    observer.observe(button.closest('.post-card')!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (isUnauthorized(state.error)) onUnauthorized(); }, [state.error, onUnauthorized]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function click() {
    if (!enabled || state.isFetching || client.isMutating({ mutationKey: queryKey, exact: true })) return;
    if (!confirmed) { void state.refetch(); return; }
    operation.mutate(!confirmed.liked);
  }

  const label = state.isFetching ? '查询中…'
    : !confirmed ? '状态未知，重试' : confirmed.liked ? '已赞' : '点赞';
  const name = state.isFetching ? '正在查询点赞状态'
    : !confirmed ? '重试查询点赞状态' : confirmed.liked ? '取消点赞' : '点赞';
  return <div className="post-like">
    <button ref={buttonRef} type="button" className="post-like-button" aria-label={name}
      aria-pressed={confirmed?.liked} disabled={!enabled} aria-disabled={processing || state.isFetching}
      onClick={click} title={confirmed?.liked ? '取消点赞' : undefined}>
      <span aria-hidden="true">👍</span>{label}
    </button>
    {confirmed && <span className="post-like-count" aria-label={`当前点赞数：${confirmed.count}`}>{confirmed.count}</span>}
    {(message || state.isError) && <span className="post-like-error" role="status">
      {message || `点赞状态查询失败：${state.error?.message}`}
    </span>}
  </div>;
}
