import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

export function usePostLogin() {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);
  const [message, setMessage] = useState('登录已失效');
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const status = useQuery({
    queryKey: ['post', 'login-status'],
    queryFn: ({ signal }) => getJson<{ valid?: unknown }>('/weibo/login/status', signal, 15000, { cache: 'no-store' }),
  });
  const qr = useMutation({
    retry: false,
    mutationFn: async () => {
      controller.current = new AbortController();
      await client.cancelQueries({ queryKey: ['post', 'login-status'] });
      return getJson('/weibo/login/qr', controller.current.signal, 360000, { method: 'POST' });
    },
    onSuccess: async () => {
      setExpired(false);
      setMessage('登录已失效');
      const checked = await status.refetch();
      if (checked.isSuccess) setExpired(checked.data?.valid !== true);
      await client.refetchQueries({ type: 'active', predicate: query => isUnauthorized(query.state.error) });
    },
    onError: () => setMessage('扫码登录失败，请重新扫码。'),
    onSettled: () => { pending.current = false; },
  });
  useEffect(() => {
    if (status.isSuccess && !pending.current) setExpired(status.data?.valid !== true);
  }, [status.data, status.isSuccess]);
  useEffect(() => () => controller.current?.abort(), []);
  const expire = useCallback(() => { setExpired(true); setMessage('登录已失效'); }, []);
  function start() {
    if (pending.current) return;
    pending.current = true;
    setMessage('登录已失效');
    qr.mutate();
  }
  return { expired, expire, message, pending: qr.isPending, started: !qr.isIdle, start };
}
