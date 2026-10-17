import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

export function usePostLogin() {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);
  const [message, setMessage] = useState('登录已失效');
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const version = useRef(0);
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
    onSuccess: () => {
      const recovery = ++version.current;
      setExpired(false);
      setMessage('登录已失效');
      void status.refetch().then(checked => {
        if (recovery === version.current && checked.isSuccess) setExpired(checked.data?.valid !== true);
      });
      void client.refetchQueries({ type: 'active', predicate: query => query.queryKey[0] === 'post'
        && ['bloggers', 'calendar', 'list'].includes(String(query.queryKey[1])) && isUnauthorized(query.state.error) });
    },
    onError: () => setMessage('扫码登录失败，请重新扫码。'),
    onSettled: () => { pending.current = false; },
  });
  useEffect(() => {
    if (status.isSuccess && !pending.current && status.data?.valid !== true) setExpired(true);
  }, [status.data, status.isSuccess]);
  useEffect(() => () => { version.current++; controller.current?.abort(); }, []);
  const expire = useCallback(() => { version.current++; setExpired(true); setMessage('登录已失效'); }, []);
  function start() {
    if (pending.current) return;
    pending.current = true;
    version.current++;
    setMessage('登录已失效');
    qr.mutate();
  }
  return { expired, expire, message, pending: qr.isPending, started: !qr.isIdle, start };
}
