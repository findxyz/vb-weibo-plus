import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { getJson, isUnauthorized } from './queries';

export default function AddBlogger({ onAdded, onUnauthorized }: { onAdded: (uid: string, select: boolean) => Promise<void>; onUnauthorized: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [validation, setValidation] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const shown = useRef(open);
  const alive = useRef(true);
  shown.current = open;
  const adding = useMutation({
    retry: false,
    mutationFn: (uid: string) => {
      controller.current = new AbortController();
      return getJson(`/post/bloggers?${new URLSearchParams({ uid })}`, controller.current.signal, 15000, { method: 'POST' });
    },
    onSuccess: async (_, uid) => {
      if (!alive.current) return;
      const select = shown.current;
      dialogRef.current?.close();
      setOpen(false);
      await onAdded(uid, select);
    },
    onError: error => {
      if (alive.current && isUnauthorized(error)) { dialogRef.current?.close(); setOpen(false); onUnauthorized(); }
    },
    onSettled: () => { pending.current = false; },
  });
  useEffect(() => () => { alive.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    dialog.showModal();
    inputRef.current!.focus();
    return () => dialog.close();
  }, [open]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const trimmed = value.trim();
    const uid = /^\d{4,}$/.test(trimmed) ? trimmed : trimmed.match(/weibo\.com\/(?:u\/)?(\d{4,})/)?.[1];
    if (!uid) { setValidation('无法识别，请输入 UID 或 weibo.com/u/ 开头的主页链接。'); return; }
    setValidation('');
    pending.current = true;
    adding.mutate(uid);
  }
  return <>
    <button type="button" className="blogger-add" aria-label="添加博主" title="添加博主" aria-disabled={adding.isPending} onClick={() => {
      if (pending.current) return;
      setValue(''); setValidation(''); adding.reset(); setOpen(true);
    }}>添加博主</button>
    {open && createPortal(<dialog ref={dialogRef} className="management-dialog" aria-labelledby="add-blogger-title" onClose={() => setOpen(false)}>
      <div className="management-window">
        <header className="search-overlay-titlebar">
          <h2 id="add-blogger-title">添加博主</h2>
          <button type="button" aria-label="关闭添加博主" onClick={() => dialogRef.current!.close()} />
        </header>
        <form className="search-overlay-body" onSubmit={submit}>
          <p className="search-overlay-tip">输入博主 UID 或主页链接，例如 https://weibo.com/u/1234567890，添加后会立即拉取最新一页微博。</p>
          <input ref={inputRef} type="text" aria-label="UID 或主页链接" placeholder="UID 或主页链接" autoComplete="off" value={value} onChange={event => setValue(event.target.value)} />
          <p className="management-status" role={validation || adding.isError ? 'alert' : 'status'}>{validation || (adding.isPending ? '正在添加并拉取微博…' : adding.isError ? `添加失败：${adding.error.message}` : '')}</p>
          <div className="search-actions"><button type="submit" className="add-submit" disabled={adding.isPending}>添加</button></div>
        </form>
      </div>
    </dialog>, document.body)}
  </>;
}
