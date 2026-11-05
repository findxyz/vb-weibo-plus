import { useEffect, useRef, useState } from 'react';
import { useImageZoom } from '../shared/useImageZoom';

function ViewerImage({ url, previewUrl }: { url: string; previewUrl?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [showLoading, setShowLoading] = useState(false);
  const zoom = useImageZoom();
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = window.setTimeout(() => setShowLoading(true), 100);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <>
      {state === 'loading' && showLoading && previewUrl && previewUrl !== url && (
        <img src={previewUrl} alt="消息预览" onError={event => { event.currentTarget.hidden = true; }} />
      )}
      <img
        {...zoom}
        src={url}
        alt="消息原图"
        decoding="async"
        fetchPriority="high"
        hidden={state !== 'loaded'}
        onLoad={async event => {
          try {
            await event.currentTarget.decode();
            setState('loaded');
          } catch {
            setState('failed');
          }
        }}
        onError={() => setState('failed')}
      />
      <p className="image-viewer-state" role="status">
        {state === 'failed' ? '原图加载失败，请关闭后重试。' : ''}
      </p>
    </>
  );
}

// 全屏查看器：Escape、遮罩点击与关闭事件统一交回父组件，由父组件清空地址。
export default function ImageViewer({ url, previewUrl, onClose }: { url: string | null; previewUrl?: string; onClose: () => void }) {
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
      {url && <ViewerImage key={url} url={url} previewUrl={previewUrl} />}
    </dialog>
  );
}
