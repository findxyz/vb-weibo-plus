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
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} className="image-viewer" aria-label="查看原图" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <ViewerImage src={images[initialIndex]} />
  </dialog>;
}
