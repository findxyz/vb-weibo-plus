import { useEffect, useRef, useState } from 'react';
import EmojiPanel from './EmojiPanel';
import { HttpError, sendText } from './api';

const HINT_DEFAULT = '按下 Enter 发送内容 / Shift+Enter 换行';
const HINT_SENDING = '发送中…';
const HINT_CONFLICT = '消息已发出，但本地同步失败，稍后会自动补全。';
const HINT_FAILED = '消息发送失败，请稍后重试。';

type Hint = { text: string; level: 'default' | 'sending' | 'error' };

export default function Composer({ gid, onSent }: { gid: number | null; onSent: () => void }) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<Hint>({ text: HINT_DEFAULT, level: 'default' });
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const caretRef = useRef<number | null>(null);
  const disabled = gid == null || sending;

  useEffect(() => {
    if (gid == null) setEmojiOpen(false);
  }, [gid]);

  // 表情插入后把光标放到短语末尾；受控输入要等值更新后再设置选区。
  useEffect(() => {
    const caret = caretRef.current;
    if (caret == null || !inputRef.current) return;
    caretRef.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(caret, caret);
  }, [text]);

  function changeText(value: string) {
    setText(value);
    if (!sending && hint.level !== 'default') setHint({ text: HINT_DEFAULT, level: 'default' });
  }

  async function send() {
    if (gid == null || sending) return;
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setHint({ text: HINT_SENDING, level: 'sending' });
    try {
      await sendText(gid, content);
      setText('');
      setHint({ text: HINT_DEFAULT, level: 'default' });
      onSent();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const hintText = error instanceof HttpError && error.status === 409
        ? message || HINT_CONFLICT
        : message || HINT_FAILED;
      setHint({ text: hintText, level: 'error' });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function insert(phrase: string) {
    const input = inputRef.current;
    if (!input) {
      setText(value => value + phrase);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    setText(`${input.value.slice(0, start)}${phrase}${input.value.slice(end)}`);
    setHint({ text: HINT_DEFAULT, level: 'default' });
    caretRef.current = start + phrase.length;
  }

  const hintClass = hint.level === 'sending' ? ' is-sending' : hint.level === 'error' ? ' is-error' : '';

  return (
    <div className="composer" aria-label="消息编辑器">
      <div className="composer-tools">
        <button ref={triggerRef} type="button" disabled={disabled} aria-expanded={emojiOpen}
          onClick={() => setEmojiOpen(open => !open)}>😊 表情</button>
      </div>
      <EmojiPanel open={emojiOpen} triggerRef={triggerRef} onInsert={insert}
        onClose={() => setEmojiOpen(false)} />
      <textarea
        ref={inputRef}
        aria-label="输入消息"
        placeholder="输入消息后按 Enter 发送"
        value={text}
        disabled={disabled}
        onChange={event => changeText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <span className={`composer-hint${hintClass}`} aria-hidden="true">{hint.text}</span>
    </div>
  );
}
