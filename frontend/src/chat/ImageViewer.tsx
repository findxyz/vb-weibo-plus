import { useEffect, useRef, useState } from 'react';

function ViewerImage({ url }: { url: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  return (
    <>
      <img
        src={url}
        alt="消息原图"
        hidden={state !== 'loaded'}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
      <p className="image-viewer-state" role="status">
        {state === 'failed' ? '原图加载失败，请关闭后重试。' : state === 'loading' ? '正在加载原图…' : ''}
      </p>
    </>
  );
}

// 全屏查看器：Escape、遮罩点击与关闭事件统一交回父组件，由父组件清空地址。
export default function ImageViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (url && !dialog.open) dialog.showModal();
    if (!url && dialog.open) dialog.close();
  }, [url]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="image-viewer"
      aria-label="查看原图"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {url && <ViewerImage key={url} url={url} />}
    </dialog>
  );
}
