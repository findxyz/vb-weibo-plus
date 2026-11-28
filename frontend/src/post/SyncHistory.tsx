import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui-sdk/react/button';
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog';
import { Field, FieldLabel } from '@ui-sdk/react/field';
import { Input } from '@ui-sdk/react/input';
import { Progress, ProgressIndicator, ProgressTrack } from '@ui-sdk/react/progress';
import { RefreshCwIcon, XIcon } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  calendarMonthsAgo,
  isDateRangeValid,
  localDateValue,
  shanghaiToday,
  toQueryDateTime,
  toQueryEndTime,
} from '../shared/date';
import { type Blogger, getJson, isConflict, isUnauthorized } from './queries';

const historyStatusKey = ['post', 'history-status'] as const;
const millisecondsPerDay = 86_400_000;
const phaseLabels = {
  PENDING: '等待同步',
  RUNNING: '同步中',
  SUCCEEDED: '同步成功',
  FAILED: '同步失败',
};

type HistoryStatus = {
  uid: number;
  start: string;
  end: string;
  phase: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  currentDate: string | null;
  fetchedCount: number;
  insertedCount: number;
  failureReason: string | null;
};

function isRunning(task: HistoryStatus | null | undefined) {
  return task?.phase === 'PENDING' || task?.phase === 'RUNNING';
}

function describeProgress(task: HistoryStatus) {
  switch (task.phase) {
    case 'PENDING':
      return null;
    case 'RUNNING':
      return `正在处理 ${task.currentDate}`;
    case 'SUCCEEDED':
      return `拉取 ${task.fetchedCount} 条，新增 ${task.insertedCount} 条`;
    case 'FAILED':
      return [
        task.currentDate && `失败日期 ${task.currentDate}`,
        `已新增 ${task.insertedCount} 条`,
        task.failureReason,
      ]
        .filter(Boolean)
        .join('，');
  }
}

export default function SyncHistory({
  blogger,
  bloggers,
  onUnauthorized,
}: {
  blogger?: Blogger;
  bloggers?: Blogger[];
  onUnauthorized: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [validation, setValidation] = useState('');
  const [tip, setTip] = useState<string>();
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: historyStatusKey,
    queryFn: async ({ signal }) =>
      (await getJson<HistoryStatus | undefined>('/post/range', signal)) ?? null,
    refetchInterval: (query) => (isRunning(query.state.data) ? 2000 : 5000),
  });
  const task = history.data;
  const running = isRunning(task);
  const detail = task && describeProgress(task);
  const taskBlogger = bloggers?.find((item) => item.uid === task?.uid);
  const account = taskBlogger ? `@${taskBlogger.screenName}` : task && `博主 UID ${task.uid}`;
  const sync = useMutation({
    retry: false,
    mutationFn: (scope: { uid: number; start: string; end: string }) => {
      controller.current = new AbortController();
      const params = new URLSearchParams({
        uid: String(scope.uid),
        start: toQueryDateTime(scope.start)!,
        end: toQueryEndTime(scope.end)!,
      });
      return getJson<void>(`/post/range?${params}`, controller.current.signal, 15000, {
        method: 'POST',
      });
    },
    onError: (error) => {
      if (!alive.current) return;
      if (isUnauthorized(error)) onUnauthorized();
      else if (isConflict(error)) setTip('已有历史同步在运行。');
      else setTip(`无法确认历史同步是否已提交：${error.message}`);
    },
    onSettled: async (_data, error) => {
      if (alive.current && !isUnauthorized(error)) {
        await queryClient.cancelQueries({ queryKey: historyStatusKey });
        if (alive.current) await history.refetch();
      }
      pending.current = false;
    },
  });
  useEffect(
    () => () => {
      alive.current = false;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!blogger) setOpen(false);
  }, [blogger]);
  useEffect(() => {
    if (!tip) return;
    const timer = setTimeout(() => setTip(undefined), 6000);
    return () => clearTimeout(timer);
  }, [tip]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!blogger || pending.current || running) return;
    if (!start || !end) {
      setValidation('请选择开始与结束日期。');
      return;
    }
    if (!isDateRangeValid(start, end)) {
      setValidation('开始日期不能晚于结束日期。');
      return;
    }
    pending.current = true;
    setTip(undefined);
    setOpen(false);
    sync.mutate({ uid: blogger.uid, start, end });
  }
  const submitting = sync.isPending && !sync.error;
  return (
    <>
      <Dialog
        open={open && Boolean(blogger)}
        container={document.body}
        closeOnOutsidePress={false}
        onOpenChange={(next, details) => {
          if (next) {
            if (!blogger) {
              details.cancel();
              return;
            }
            const today = shanghaiToday();
            setStart(localDateValue(calendarMonthsAgo(new Date(`${today}T12:00:00`), 24)));
            setEnd(today);
            setValidation('');
          }
          setOpen(next);
        }}
      >
        <DialogTrigger
          className="search-open sync-history-open"
          aria-label="同步历史"
          disabled={!blogger || running || sync.isPending}
          focusableWhenDisabled={Boolean(blogger && !running && sync.isPending)}
          title={!blogger ? '请先选择一位博主' : '同步历史微博'}
        >
          <RefreshCwIcon aria-hidden="true" />
          同步历史
        </DialogTrigger>
        {blogger && (
          <>
            <DialogBackdrop className="management-backdrop" />
            <DialogContent className="management-dialog">
              <div className="management-window">
                <header className="search-overlay-titlebar">
                  <DialogTitle>同步历史微博</DialogTitle>
                  <DialogClose aria-label="关闭同步历史微博">
                    <XIcon aria-hidden="true" />
                  </DialogClose>
                </header>
                <form className="search-overlay-body" onSubmit={submit}>
                  <DialogDescription className="search-overlay-tip">
                    按天拉取 <b>@{blogger.screenName}</b>{' '}
                    在选定范围内的微博，已存在的会自动跳过。同步在后台执行，可在工具栏查看进度和结果。刷新页面可查看已保存的微博。
                  </DialogDescription>
                  <Field className="search-field">
                    <FieldLabel>开始日期</FieldLabel>
                    <Input type="date" value={start} onValueChange={setStart} />
                  </Field>
                  <Field className="search-field">
                    <FieldLabel>结束日期</FieldLabel>
                    <Input type="date" value={end} onValueChange={setEnd} />
                  </Field>
                  <p className="management-status" role="alert">
                    {validation}
                  </p>
                  <div className="search-actions">
                    <Button
                      type="submit"
                      className="sync-submit"
                      aria-label="开始同步"
                      disabled={running}
                    >
                      开始同步
                    </Button>
                  </div>
                </form>
              </div>
            </DialogContent>
          </>
        )}
      </Dialog>
      {(task || submitting || history.isError) && (
        <div className="sync-history-status" data-phase={task?.phase} role="status">
          {task ? (
            <>
              <div className="sync-history-status-heading">
                <strong>{phaseLabels[task.phase]}</strong>
                <span title={account ?? undefined}>{account}</span>
              </div>
              {task.phase === 'RUNNING' && task.currentDate && (
                <Progress
                  className="sync-progress"
                  aria-label="已完成日期"
                  min={0}
                  max={1 + (Date.parse(task.end) - Date.parse(task.start)) / millisecondsPerDay}
                  value={Math.max(
                    0,
                    (Date.parse(task.currentDate) - Date.parse(task.start)) / millisecondsPerDay,
                  )}
                >
                  <ProgressTrack>
                    <ProgressIndicator />
                  </ProgressTrack>
                </Progress>
              )}
              {detail && <div className="sync-history-status-detail">{detail}</div>}
              <div>
                {task.start} 至 {task.end}
              </div>
            </>
          ) : submitting ? (
            <div>正在提交历史同步……</div>
          ) : null}
          {history.isError && <div>暂时无法读取同步状态，稍后重试。</div>}
        </div>
      )}
      {tip &&
        createPortal(
          <div className="global-tip" role="alert">
            {tip}
          </div>,
          document.body,
        )}
    </>
  );
}
