import { useEffect, useState } from 'react';

export default function PostLogin({ pending, started, message, onStart }: { pending: boolean; started: boolean; message: string; onStart: () => void }) {
  const [image, setImage] = useState('');
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!pending) return;
    let active = true;
    let preload: HTMLImageElement | undefined;
    function refresh() {
      if (preload) { preload.onload = null; preload.onerror = null; }
      preload = new Image();
      preload.onload = () => { if (active) { setImage(preload!.src); setRetrying(false); } };
      preload.onerror = () => { if (active) setRetrying(true); };
      preload.src = `/weibo/login/qr/image?t=${Date.now()}`;
    }
    const first = setTimeout(refresh, 3000);
    const interval = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(interval);
      if (preload) { preload.onload = null; preload.onerror = null; }
    };
  }, [pending]);
  return <div className="login-expired" role="status">
    {!image && started && <div className="qr-loading">{pending ? retrying ? '二维码加载重试…' : '正在获取二维码…' : '暂无二维码'}</div>}
    {image && <img src={image} alt="扫码登录二维码" />}
    <span className="panel-state">{message}</span>
    <button type="button" disabled={pending} onClick={onStart}>{pending ? '扫码中…' : '扫码登录'}</button>
  </div>;
}
