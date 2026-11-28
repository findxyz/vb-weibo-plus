import { Button } from '@ui-sdk/react/button';
import { Dialog, DialogBackdrop, DialogClose, DialogContent } from '@ui-sdk/react/dialog';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
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
  return (
    <>
      {status === 'loading' && showPreview && previewSrc !== src && (
        <img
          src={previewSrc}
          alt="微博预览"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <img
        {...zoom}
        src={src}
        alt="微博原图"
        decoding="async"
        fetchPriority="high"
        hidden={status !== 'loaded'}
        onLoad={async (event) => {
          try {
            await event.currentTarget.decode();
            setStatus('loaded');
          } catch {
            setStatus('error');
          }
        }}
        onError={() => setStatus('error')}
      />
      <p id="image-viewer-state" role="status">
        {status === 'error' ? '图片加载失败' : ''}
      </p>
    </>
  );
}

export default function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: GalleryImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const opener = openerRef.current;
    return () => {
      queueMicrotask(() => {
        if (
          opener?.isConnected &&
          (document.activeElement === document.body || document.activeElement === null)
        ) {
          opener.focus();
        }
      });
    };
  }, []);

  function move(offset: number) {
    setIndex((previous) => (previous + offset + images.length) % images.length);
  }

  return (
    <Dialog
      open
      container={document.body}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogBackdrop className="image-viewer-backdrop" />
      <DialogContent
        render={<dialog />}
        className="image-viewer"
        aria-label="查看原图"
        initialFocus="content"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <ViewerImage key={index} {...images[index]} />
        <DialogClose className="viewer-close" aria-label="关闭原图">
          <XIcon aria-hidden="true" />
        </DialogClose>
        {images.length > 1 && (
          <>
            <Button
              type="button"
              className="viewer-prev"
              aria-label="上一张"
              onClick={() => move(-1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              className="viewer-next"
              aria-label="下一张"
              onClick={() => move(1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
            <span className="viewer-counter">{`${index + 1} / ${images.length}`}</span>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
