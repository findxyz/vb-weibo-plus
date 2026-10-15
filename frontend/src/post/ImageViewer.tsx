import { useEffect, useRef, useState } from 'react';

function ViewerImage({ src }: { src: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return <>
    <img src={src} alt="微博原图" hidden={status !== 'loaded'} onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
    <p id="image-viewer-state" role="status">{status === 'loading' ? '加载中…' : status === 'error' ? '图片加载失败' : ''}</p>
  </>;
}

export default function ImageViewer({ images, initialIndex, onClose }: { images: string[]; initialIndex: number; onClose: () => void }) {
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
    <ViewerImage key={index} src={images[index]} />
    {images.length > 1 && <>
      <button type="button" className="viewer-prev" aria-label="上一张" onClick={() => move(-1)}>‹</button>
      <button type="button" className="viewer-next" aria-label="下一张" onClick={() => move(1)}>›</button>
      <span className="viewer-counter">{`${index + 1} / ${images.length}`}</span>
    </>}
  </dialog>;
}
