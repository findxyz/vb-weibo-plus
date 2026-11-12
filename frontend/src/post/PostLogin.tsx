import { useEffect, useState } from 'react';

export default function PostLogin({ pending, started, message, onStart }: { pending: boolean; started: boolean; message: string; onStart: () => void }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    if (!pending) return;
    let active = true;
    let hasImage = false;
    let timer: ReturnType<typeof setTimeout>;
    let preload: HTMLImageElement | undefined;
    setImage('');
    function refresh() {
      if (preload) { preload.onload = null; preload.onerror = null; }
      preload = new Image();
      preload.onload = () => {
        if (!active) return;
        hasImage = true;
        setImage(preload!.src);
        timer = setTimeout(refresh, 10000);
      };
      preload.onerror = () => {
        if (active) timer = setTimeout(refresh, hasImage ? 10000 : 1000);
      };
      preload.src = `/weibo/login/qr/image?t=${Date.now()}`;
    }
    timer = setTimeout(refresh, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
      if (preload) { preload.onload = null; preload.onerror = null; }
    };
  }, [pending]);
  return <div className="login-expired" role="status">
    {!image && started && <div className="qr-loading">{pending ? '正在获取二维码…' : '暂无二维码'}</div>}
    {image && <img src={image} alt="扫码登录二维码" />}
    <span className="panel-state">{message}</span>
    <button type="button" aria-label={pending ? '扫码中…' : '扫码登录'} disabled={pending} onClick={onStart}>{pending ? '扫码中…' : '扫码登录'}</button>
  </div>;
}
