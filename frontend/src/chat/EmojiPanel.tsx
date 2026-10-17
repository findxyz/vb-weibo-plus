import { useEffect, useRef, useState, type RefObject } from 'react';
import { emojiEntries } from './emoji';

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onInsert: (phrase: string) => void;
};

// 表情面板：首次打开时才按共享映射构建格子；外点与 Escape 关闭。
export default function EmojiPanel({ open, triggerRef, onClose, onInsert }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<[string, string][] | null>(null);

  useEffect(() => {
    if (open && entries === null) setEntries(emojiEntries());
  }, [open, entries]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const focusInside = panelRef.current?.contains(document.activeElement);
      onClose();
      if (focusInside) triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector('button')?.focus();
  }, [open, entries]);

  return (
    <div ref={panelRef} className="emoji-panel" role="dialog" aria-label="表情选择" hidden={!open}>
      <div className="emoji-panel-grid">
        {entries?.map(([phrase, url]) => (
          <button key={phrase} type="button" className="emoji-cell" title={phrase}
            onClick={() => onInsert(phrase)}>
            <img src={url} alt={phrase} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
