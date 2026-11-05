import { useEffect, useRef, useState } from 'react';
import { useImageZoom } from '../shared/useImageZoom';

export type GalleryImage = { src: string; previewSrc: string };

function ViewerImage({ src, previewSrc }: GalleryImage) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [showPreview, setShowPreview] = useState(false);
  const zoom = useImageZoom();
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = window.setTimeout(() => setShowPreview(true), 100);
    return () => window.clearTimeout(timer);
  }, [status]);
  return <>
    {status === 'loading' && showPreview && previewSrc !== src && (
      <img src={previewSrc} alt="微博预览" onError={event => { event.currentTarget.hidden = true; }} />
    )}
    <img {...zoom} src={src} alt="微博原图" decoding="async" fetchPriority="high" hidden={status !== 'loaded'}
      onLoad={async event => {
        try {
          await event.currentTarget.decode();
          setStatus('loaded');
        } catch {
          setStatus('error');
        }
      }} onError={() => setStatus('error')} />
    <p id="image-viewer-state" role="status">{status === 'error' ? '图片加载失败' : ''}</p>
  </>;
}

export default function ImageViewer({ images, initialIndex, onClose }: { images: GalleryImage[]; initialIndex: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function move(offset: number) { setIndex(previous => (previous + offset + images.length) % images.length); }

  return <dialog ref={ref} className="image-viewer" aria-label="查看原图" onClose={onClose}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    {/* Each index owns its load state; late events stay with the discarded image. */}
    <ViewerImage key={index} {...images[index]} />
    {images.length > 1 && <>
      <button type="button" className="viewer-prev" aria-label="上一张" onClick={() => move(-1)}>‹</button>
      <button type="button" className="viewer-next" aria-label="下一张" onClick={() => move(1)}>›</button>
      <span className="viewer-counter">{`${index + 1} / ${images.length}`}</span>
    </>}
  </dialog>;
}
