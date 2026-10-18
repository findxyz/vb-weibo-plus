import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { calendarMonthsAgo, isDateRangeValid, localDateValue, shanghaiToday, toQueryDateTime, toQueryEndTime } from '../shared/date.js';
import { getJson, isUnauthorized, type Blogger } from './queries';

export default function SyncHistory({ blogger, visit, onStart, onComplete, onUnauthorized }: {
  blogger?: Blogger; visit: number; onStart: () => void; onComplete: (uid: number, visit: number) => Promise<void>; onUnauthorized: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [validation, setValidation] = useState('');
  const [tip, setTip] = useState<{ message: string }>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const sync = useMutation({
    retry: false,
    mutationFn: (scope: { uid: number; visit: number; start: string; end: string }) => {
      controller.current = new AbortController();
      const params = new URLSearchParams({ uid: String(scope.uid), start: toQueryDateTime(scope.start)!, end: toQueryEndTime(scope.end)! });
      return getJson(`/post/range?${params}`, controller.current.signal, 15000, { method: 'POST' });
    },
    onSuccess: async (_, scope) => { if (alive.current) await onComplete(scope.uid, scope.visit); },
    onError: error => {
      if (!alive.current) return;
      if (isUnauthorized(error)) onUnauthorized();
      else setTip({ message: `同步历史微博失败：${error.message}` });
    },
    onSettled: () => { pending.current = false; },
  });
  useEffect(() => () => { alive.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!tip) return;
    const timer = setTimeout(() => setTip(undefined), 6000);
    return () => clearTimeout(timer);
  }, [tip]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!blogger || pending.current) return;
    if (!start || !end) { setValidation('请选择开始与结束日期。'); return; }
    if (!isDateRangeValid(start, end)) { setValidation('开始日期不能晚于结束日期。'); return; }
    pending.current = true;
    onStart(); setTip(undefined);
    dialogRef.current!.close(); setOpen(false);
    sync.mutate({ uid: blogger.uid, visit, start, end });
  }
  return <>
    <button type="button" className="search-open sync-history-open" aria-label="同步历史" disabled={!blogger} aria-disabled={!blogger || sync.isPending} title={!blogger ? '请先选择一位博主' : '同步历史微博'} onClick={() => {
      if (!blogger || pending.current) return;
      const today = shanghaiToday();
      setStart(localDateValue(calendarMonthsAgo(new Date(`${today}T12:00:00`), 24)));
      setEnd(today); setValidation(''); setOpen(true);
    }}>同步历史</button>
    {open && blogger && createPortal(<dialog ref={dialogRef} className="management-dialog" aria-labelledby="sync-history-title" onClose={() => setOpen(false)}>
      <div className="management-window">
        <header className="search-overlay-titlebar"><span className="add-blogger-title-icon" aria-hidden="true">↓</span><h2 id="sync-history-title">同步历史微博</h2><button type="button" aria-label="关闭同步历史微博" onClick={() => dialogRef.current!.close()} /></header>
        <form className="search-overlay-body" onSubmit={submit}>
          <p className="search-overlay-tip">按天拉取 <b>@{blogger.screenName}</b> 在选定范围内的微博，已存在的会自动跳过；范围越大耗时越久，同步在服务端执行，发起后弹窗会自动关闭，完成后日期面板自动刷新。若已有同步任务在运行，本次请求会被跳过。</p>
          <label className="search-field">开始日期<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
          <label className="search-field">结束日期<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
          <p className="management-status" role="alert">{validation}</p>
          <div className="search-actions"><button type="submit">开始同步</button></div>
        </form>
      </div>
    </dialog>, document.body)}
    {tip && createPortal(<div className="global-tip" role="alert">{tip.message}</div>, document.body)}
  </>;
}
