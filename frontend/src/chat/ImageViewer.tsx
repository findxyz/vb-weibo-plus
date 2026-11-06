import { useEffect, useRef, useState } from 'react';
import { useImageZoom } from '../shared/useImageZoom';

export type GalleryImage = { url: string; previewUrl?: string };
export type ImageSelection = { images: GalleryImage[]; index: number };

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
export default function ImageViewer({ selection, onChange, onClose }: {
  selection: ImageSelection | null;
  onChange: (selection: ImageSelection) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const image = selection?.images[selection.index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selection && !dialog.open) dialog.showModal();
    if (!selection && dialog.open) dialog.close();
  }, [selection]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function move(offset: number) {
    if (!selection) return;
    onChange({ ...selection, index: (selection.index + offset + selection.images.length) % selection.images.length });
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-viewer"
      aria-label="查看原图"
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {image && <ViewerImage key={image.url} {...image} />}
      {selection && selection.images.length > 1 && <>
        <button type="button" className="viewer-prev" aria-label="上一张" onClick={() => move(-1)}>‹</button>
        <button type="button" className="viewer-next" aria-label="下一张" onClick={() => move(1)}>›</button>
        <span className="viewer-counter">{`${selection.index + 1} / ${selection.images.length}`}</span>
      </>}
    </dialog>
  );
}
