import { useEffect, useRef, useState } from 'react';

const HOVER_OPEN_MS = 3000;

type Entry = { url: string; anchor: HTMLElement };

export default function DreamLauncher() {
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const openRef = useRef(false);
  const confirmed = useRef(new Set<string>());
  const timer = useRef(0);
  const anchorRef = useRef<HTMLElement | null>(null);

  function hidePopover() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
    anchorRef.current = null;
    openRef.current = false;
    setEntry(null);
  }

  useEffect(() => {
    const cancel = () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = 0;
      }
    };
    const hoverable = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>('[data-sender-id]') : null;
      if (!element || element.closest('dialog[open]')) return null;
      const uid = Number(element.dataset.senderId);
      return Number.isSafeInteger(uid) && uid > 0 ? element : null;
    };
    const show = (avatar: HTMLElement, url: string) => {
      const rect = avatar.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
        top: Math.max(8, rect.top - 92),
      });
      anchorRef.current = avatar;
      openRef.current = true;
      setEntry({ url, anchor: avatar });
    };
    const onPointerOver = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      const avatar = hoverable(event.target);
      if (!avatar || avatar === anchorRef.current) return;
      cancel();
      anchorRef.current = avatar;
      timer.current = window.setTimeout(async () => {
        timer.current = 0;
        const uid = avatar.dataset.senderId ?? '';
        const url = `/chat/dream/${uid}.html`;
        if (!confirmed.current.has(uid)) {
          const page = await fetch(url).catch(() => null);
          if (anchorRef.current !== avatar) return;
          if (!page?.ok) {
            openRef.current = false;
            setEntry(null);
            return;
          }
          confirmed.current.add(uid);
        }
        show(avatar, url);
      }, HOVER_OPEN_MS);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (openRef.current) return;
      const avatar = hoverable(event.target);
      if (!avatar) return;
      const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (to && avatar.contains(to)) return;
      cancel();
    };
    const onScroll = () => { if (openRef.current) hidePopover(); };
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      cancel();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  function openGame() {
    if (!entry) return;
    const url = entry.url;
    hidePopover();
    if (frameRef.current) frameRef.current.src = `${url}?v=${Date.now()}`;
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    window.setTimeout(() => frameRef.current?.focus(), 0);
  }

  return (
    <>
      {entry && (
        <div ref={popoverRef} className="dream-popover" role="dialog" aria-label="盗梦空间入口"
          style={{ left: position.left, top: position.top }}>
          <header className="dream-popover-titlebar">
            <span className="dream-popover-icon" aria-hidden="true">🌀</span>
            <button type="button" aria-label="关闭盗梦空间入口" onClick={hidePopover} />
          </header>
          <div className="dream-popover-body">
            <button type="button" onClick={openGame}>🌀 进入盗梦空间</button>
          </div>
        </div>
      )}
      <dialog ref={dialogRef} className="dream-dialog" aria-labelledby="dream-title"
        onClose={() => { if (frameRef.current) frameRef.current.src = 'about:blank'; }}>
        <div className="dream-window">
          <header className="dream-titlebar">
            <span className="dream-title-icon" aria-hidden="true">🌀</span>
            <h2 id="dream-title">盗梦空间 · 迷你米奇</h2>
            <button type="button" aria-label="关闭盗梦空间" onClick={() => dialogRef.current?.close()} />
          </header>
          <div className="dream-stage">
            <iframe ref={frameRef} title="迷你米奇游戏" allow="autoplay" />
          </div>
        </div>
      </dialog>
    </>
  );
}
