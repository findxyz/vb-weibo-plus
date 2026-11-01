import { useEffect, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

type LikeState = { liked: boolean; count: number };

export default function PostLikeButton({ mblogId, enabled, session, onUnauthorized }: {
  mblogId: string; enabled: boolean; session: number; onUnauthorized: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
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
  const operation = useMutation({
    mutationKey: queryKey, retry: false,
    mutationFn: async (target: boolean) => {
      try {
        const result = await getJson<LikeState>('/post/like', new AbortController().signal, 15000, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ mblogId, liked: String(target) }),
        });
        client.setQueryData(queryKey, result);
        return result;
      } catch (failure) {
        if (!isUnauthorized(failure)) {
          let checked: LikeState;
          try {
            checked = await client.fetchQuery({ queryKey, queryFn: load, staleTime: 0 });
          } catch {
            await client.invalidateQueries({ queryKey, exact: true, refetchType: mounted.current ? 'none' : 'active' });
            throw new Error('操作结果尚未确认，请重试查询点赞状态。');
          }
          if (checked.liked === target) return checked;
        } else await client.invalidateQueries({ queryKey, exact: true, refetchType: mounted.current ? 'none' : 'active' });
        throw failure;
      }
    },
    onSuccess: (result, target) => {
      if (mounted.current && result.liked !== target) setMessage('微博尚未确认状态变更，请稍后重试。');
    },
    onError: error => {
      if (!mounted.current) return;
      if (isUnauthorized(error)) onUnauthorized();
      else setMessage(error.message);
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
    setMessage('');
    if (!confirmed) { void state.refetch(); return; }
    operation.mutate(!confirmed.liked);
  }

  const label = processing ? '处理中…' : state.isFetching ? '查询中…'
    : !confirmed ? '状态未知，重试' : confirmed.liked ? '已赞' : '点赞';
  const name = processing ? '正在处理点赞' : state.isFetching ? '正在查询点赞状态'
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
