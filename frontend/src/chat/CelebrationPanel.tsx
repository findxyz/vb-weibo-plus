import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import type { CelebrationMember } from './celebration';

export function CelebrationRoster({ members, onOpen, onRemove }: {
  members: CelebrationMember[];
  onOpen: (member: CelebrationMember, anchor: HTMLElement) => void;
  onRemove: (member: CelebrationMember) => void;
}) {
  if (!members.length) return null;
  return (
    <div className="celebration-roster">
      {members.map(member => (
        <span key={member.senderId} className="celebration-chip"
          title={`沉默 ${member.interval} 秒后回归时，怪兽会来戳破泡泡`}>
          <Avatar className="celebration-chip-avatar" name={member.name} avatar={member.avatar} />
          <button type="button" className="celebration-chip-name"
            onClick={event => onOpen(member, event.currentTarget)}>
            {member.name || '未知成员'}
          </button>
          <button type="button" className="celebration-chip-remove"
            aria-label={`将${member.name || '未知成员'}移出庆祝名单`}
            onClick={() => onRemove(member)}>✕</button>
        </span>
      ))}
    </div>
  );
}

export type CelebrationDraft = {
  senderId: number;
  name: string;
  avatar: string;
  interval: number;
  member: boolean;
  anchor: HTMLElement;
};

function parseInterval(value: string) {
  const text = value.trim();
  const raw = Number(text);
  return text !== '' && Number.isFinite(raw) ? Math.max(Math.floor(raw), 1) : 30;
}

export function CelebrationPopover({ draft, onClose, onSave, onInterval, onRemove }: {
  draft: CelebrationDraft;
  onClose: () => void;
  onSave: (interval: number) => void;
  onInterval: (interval: number) => void;
  onRemove: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState(String(draft.interval));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const rect = draft.anchor.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)),
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 210)),
    });
  }, [draft]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || draft.anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [draft.anchor, onClose]);

  return (
    <div ref={popoverRef} className="celebration-popover" role="dialog" aria-label="回归庆祝设置"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}>
      <header className="celebration-popover-titlebar">
        <span className="celebration-popover-icon" aria-hidden="true">🎉</span>
        <h2>回归庆祝</h2>
        <button type="button" aria-label="关闭回归庆祝设置" onClick={onClose} />
      </header>
      <div className="celebration-popover-body">
        <label className="celebration-popover-row">
          <span>沉默间隔（秒）</span>
          <input type="number" min={1} step={1} value={interval}
            onChange={event => {
              setInterval(event.target.value);
              if (draft.member) onInterval(parseInterval(event.target.value));
            }}
            onBlur={() => { if (draft.member) onInterval(parseInterval(interval)); }} />
        </label>
        <span className="celebration-popover-hint">沉默达到间隔后，怪兽会来戳破泡泡欢迎回归</span>
        {draft.member ? (
          <button type="button" className="celebration-popover-remove" onClick={onRemove}>👋 移出庆祝名单</button>
        ) : (
          <button type="button" className="celebration-popover-join"
            onClick={() => onSave(parseInterval(interval))}>🎉 加入庆祝名单</button>
        )}
      </div>
    </div>
  );
}
