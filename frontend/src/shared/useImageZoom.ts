import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function useImageZoom() {
  const ref = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const image = ref.current!;
    const dialog = image.closest('dialog')!;
    function zoom(event: WheelEvent) {
      event.preventDefault();
      if (image.hidden || !image.naturalWidth || !event.deltaY) return;
      const rect = image.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? dialog.clientHeight : 1);
      const maximum = Math.max(8, image.naturalWidth / image.clientWidth, image.naturalHeight / image.clientHeight);
      setView(previous => {
        const scale = Math.max(1, Math.min(maximum, previous.scale * Math.exp(-delta * 0.002)));
        if (scale === 1) return { scale: 1, x: 0, y: 0 };
        const ratio = scale / previous.scale;
        return {
          scale,
          x: previous.x + (event.clientX - rect.x - rect.width / 2) * (1 - ratio),
          y: previous.y + (event.clientY - rect.y - rect.height / 2) * (1 - ratio),
        };
      });
    }
    // 原生监听器允许阻止滚轮的默认滚动，避免缩放时带动查看器或页面。
    dialog.addEventListener('wheel', zoom, { passive: false });
    return () => dialog.removeEventListener('wheel', zoom);
  }, []);

  function endDrag(event: PointerEvent<HTMLImageElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    ref,
    draggable: false,
    style: {
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
      cursor: view.scale > 1 ? 'grab' : 'zoom-in',
      touchAction: 'none',
      userSelect: 'none',
    } as const,
    onDoubleClick: () => setView({ scale: 1, x: 0, y: 0 }),
    onPointerDown: (event: PointerEvent<HTMLImageElement>) => {
      if (event.button !== 0 || view.scale === 1) return;
      event.preventDefault();
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: view.x, offsetY: view.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLImageElement>) => {
      const start = drag.current;
      if (start?.pointerId !== event.pointerId) return;
      setView(previous => ({ ...previous, x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y }));
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture: () => { drag.current = null; },
  };
}
