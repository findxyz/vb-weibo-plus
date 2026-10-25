import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { calendarMonthsAgo, isDateRangeValid, localDateValue, shanghaiToday, toQueryDateTime, toQueryEndTime } from '../shared/date.js';
import { getJson, isUnauthorized, type Blogger } from './queries';

export default function SyncHistory({ blogger, onUnauthorized }: {
  blogger?: Blogger; onUnauthorized: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [validation, setValidation] = useState('');
  const [tip, setTip] = useState<{ message: string; error?: boolean }>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const sync = useMutation({
    retry: false,
    mutationFn: (scope: { uid: number; start: string; end: string }) => {
      controller.current = new AbortController();
      const params = new URLSearchParams({ uid: String(scope.uid), start: toQueryDateTime(scope.start)!, end: toQueryEndTime(scope.end)! });
      return getJson<void>(`/post/range?${params}`, controller.current.signal, 15000, { method: 'POST' });
    },
    onSuccess: () => { if (alive.current) setTip({ message: '已提交后台同步，可继续浏览，稍后请手动刷新。' }); },
    onError: error => {
      if (!alive.current) return;
      if (isUnauthorized(error)) onUnauthorized();
      else setTip({ message: `提交历史微博同步失败：${error.message}`, error: true });
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
    setTip(undefined);
    dialogRef.current!.close(); setOpen(false);
    sync.mutate({ uid: blogger.uid, start, end });
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
        <header className="search-overlay-titlebar"><h2 id="sync-history-title">同步历史微博</h2><button type="button" aria-label="关闭同步历史微博" onClick={() => dialogRef.current!.close()} /></header>
        <form className="search-overlay-body" onSubmit={submit}>
          <p className="search-overlay-tip">按天拉取 <b>@{blogger.screenName}</b> 在选定范围内的微博，已存在的会自动跳过。提交后弹窗自动关闭，同步在后台执行，可继续浏览；稍后请手动刷新页面查看，进度和结果可查看服务端日志。若已有同步任务在运行，本次请求会被跳过。</p>
          <label className="search-field">开始日期<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
          <label className="search-field">结束日期<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
          <p className="management-status" role="alert">{validation}</p>
          <div className="search-actions"><button type="submit" className="sync-submit" aria-label="开始同步">开始同步</button></div>
        </form>
      </div>
    </dialog>, document.body)}
    {tip && createPortal(<div className="global-tip" role={tip.error ? 'alert' : 'status'}>{tip.message}</div>, document.body)}
  </>;
}
