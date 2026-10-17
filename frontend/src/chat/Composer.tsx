import { useEffect, useRef, useState } from 'react';
import EmojiPanel from './EmojiPanel';
import { HttpError, sendImage, sendText, sendVideo } from './api';

const HINT_DEFAULT = '按下 Enter 发送内容 / Shift+Enter 换行';
const HINT_SENDING = '发送中…';
const HINT_CONFLICT = '消息已发出，但本地同步失败，稍后会自动补全。';
const HINT_FAILED = '消息发送失败，请稍后重试。';
const HINT_IMAGE_FAILED = '图片发送失败，请稍后重试。';
const HINT_VIDEO_FAILED = '视频发送失败，请稍后重试。';
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

type Hint = { text: string; level: 'default' | 'sending' | 'error' };
type Attachment = { kind: 'image' | 'video'; file: File; url: string };

export default function Composer({ gid, onSent, onOpenHistory, onOpenAnalysis }: {
  gid: number | null;
  onSent: () => void;
  onOpenHistory?: () => void;
  onOpenAnalysis?: () => void;
}) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<Hint>({ text: HINT_DEFAULT, level: 'default' });
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | null>(null);
  const disabled = gid == null || sending;

  useEffect(() => {
    if (gid == null) setEmojiOpen(false);
  }, [gid]);

  // 附件替换或卸载时释放预览地址。
  useEffect(() => () => {
    if (attachment) URL.revokeObjectURL(attachment.url);
  }, [attachment]);

  // 表情插入后把光标放到短语末尾；受控输入要等值更新后再设置选区。
  useEffect(() => {
    const caret = caretRef.current;
    if (caret == null || !inputRef.current) return;
    caretRef.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(caret, caret);
  }, [text]);

  function defaultHint() {
    setHint({ text: HINT_DEFAULT, level: 'default' });
  }

  function changeText(value: string) {
    setText(value);
    if (!sending && hint.level !== 'default') defaultHint();
  }

  function resetInputs() {
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  }

  function accept(kind: 'image' | 'video', file: File | null) {
    if (!file) return;
    const isImage = kind === 'image';
    const validType = isImage ? file.type.startsWith('image/') : file.type === 'video/mp4';
    if (!validType) {
      setHint({ text: isImage ? '仅支持图片文件。' : '仅支持 MP4 视频文件。', level: 'error' });
      return;
    }
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      setHint({ text: isImage ? '图片不能超过 20MB。' : '视频不能超过 100MB。', level: 'error' });
      return;
    }
    setEmojiOpen(false);
    setAttachment({ kind, file, url: URL.createObjectURL(file) });
    setHint({ text: isImage ? '按下 Enter 发送图片' : '按下 Enter 发送视频', level: 'default' });
    requestAnimationFrame(() => attachmentRef.current?.focus());
  }

  function clearAttachment() {
    setAttachment(null);
    resetInputs();
    defaultHint();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function sendAttachment() {
    if (gid == null || sending || !attachment) return;
    const { kind, file } = attachment;
    setSending(true);
    setHint({ text: HINT_SENDING, level: 'sending' });
    try {
      await (kind === 'image' ? sendImage(gid, file) : sendVideo(gid, file));
      setAttachment(null);
      resetInputs();
      defaultHint();
      onSent();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setHint({ text: message || (kind === 'image' ? HINT_IMAGE_FAILED : HINT_VIDEO_FAILED), level: 'error' });
    } finally {
      setSending(false);
      attachmentRef.current?.focus();
    }
  }

  async function send() {
    if (gid == null || sending) return;
    if (attachment) {
      await sendAttachment();
      return;
    }
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setHint({ text: HINT_SENDING, level: 'sending' });
    try {
      await sendText(gid, content);
      setText('');
      defaultHint();
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

  function handlePaste(event: React.ClipboardEvent<HTMLElement>) {
    if (gid == null) return;
    for (const item of event.clipboardData.items) {
      if (item.kind !== 'file') continue;
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { event.preventDefault(); accept('image', file); }
        return;
      }
      if (item.type.startsWith('video/')) {
        const file = item.getAsFile();
        if (file) { event.preventDefault(); accept('video', file); }
        return;
      }
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
    defaultHint();
    caretRef.current = start + phrase.length;
  }

  const hintClass = hint.level === 'sending' ? ' is-sending' : hint.level === 'error' ? ' is-error' : '';

  return (
    <div className="composer" aria-label="消息编辑器">
      <div className="composer-tools">
        <button ref={triggerRef} type="button" disabled={disabled || attachment != null}
          aria-expanded={emojiOpen} onClick={() => setEmojiOpen(open => !open)}>😊 表情</button>
        <button type="button" disabled={disabled} onClick={() => imageInputRef.current?.click()}>
          <span className="composer-tool-emoji" aria-hidden="true">🖼️</span>图片
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" hidden
          onChange={event => { accept('image', event.target.files?.[0] ?? null); event.target.value = ''; }} />
        <button type="button" disabled={disabled} onClick={() => videoInputRef.current?.click()}>
          <span className="composer-tool-emoji" aria-hidden="true">🎬</span>视频
        </button>
        <input ref={videoInputRef} type="file" accept="video/mp4" hidden
          onChange={event => { accept('video', event.target.files?.[0] ?? null); event.target.value = ''; }} />
        <button type="button" className="history-open" disabled={disabled} onClick={onOpenHistory}>📜 聊天记录</button>
        <button type="button" disabled={disabled} onClick={onOpenAnalysis}>🤖 群聊分析</button>
      </div>
      <EmojiPanel open={emojiOpen} triggerRef={triggerRef} onInsert={insert}
        onClose={() => setEmojiOpen(false)} />
      {attachment && (
        <div
          ref={attachmentRef}
          className="composer-attachment"
          tabIndex={0}
          onPaste={handlePaste}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
              event.preventDefault();
              void sendAttachment();
            }
          }}
        >
          {attachment.kind === 'image'
            ? <img className="composer-attachment-preview" src={attachment.url} alt="" />
            : <video className="composer-attachment-preview-video" src={attachment.url} muted />}
          <button type="button" className="composer-attachment-remove" aria-label="删除附件"
            disabled={sending} onClick={clearAttachment}>✕</button>
        </div>
      )}
      {!attachment && (
        <textarea
          ref={inputRef}
          aria-label="输入消息"
          placeholder="输入消息后按 Enter 发送"
          value={text}
          disabled={disabled}
          onChange={event => changeText(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
      )}
      <span className={`composer-hint${hintClass}`} aria-hidden="true">{hint.text}</span>
    </div>
  );
}
