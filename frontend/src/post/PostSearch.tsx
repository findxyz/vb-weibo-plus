import { useQueryClient } from '@tanstack/react-query';
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
import { SearchIcon, XIcon } from 'lucide-react';
import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { formatDate, isDateRangeValid, shanghaiToday } from '../shared/date';
import { isUnauthorized, type Post, type SearchRequest, usePostSearch } from './queries';

function SearchSnippet({ post, keyword }: { post: Post; keyword: string }) {
  const text = (
    post.contentRaw ||
    new DOMParser().parseFromString(post.content || '', 'text/html').body.textContent ||
    ''
  ).trim();
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return <>{text.slice(0, 80)}</>;
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + keyword.length + 30);
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, index)}
      <mark>{text.slice(index, index + keyword.length)}</mark>
      {text.slice(index + keyword.length, end)}
      {end < text.length && '…'}
    </>
  );
}

function SearchBody({
  uid,
  scopeLabel,
  keywordRef,
  onClose,
  onSelectPost,
  onUnauthorized,
}: {
  uid: number | null;
  scopeLabel: string;
  keywordRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSelectPost: (post: Post) => void;
  onUnauthorized: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [start, setStart] = useState('2010-01-01');
  const [end, setEnd] = useState(shanghaiToday);
  const [validation, setValidation] = useState('');
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const search = usePostSearch(uid, request);

  useEffect(() => {
    if (isUnauthorized(search.error)) {
      onUnauthorized();
      onClose();
    }
  }, [search.error, onUnauthorized, onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (search.isFetching) return;
    const trimmed = keyword.trim();
    if (!trimmed) {
      setValidation('请输入关键词。');
      return;
    }
    if (!isDateRangeValid(start, end)) {
      setValidation('开始日期不能晚于结束日期。');
      return;
    }
    setValidation('');
    setRequest((previous) => ({
      keyword: trimmed,
      start,
      end,
      attempt: (previous?.attempt ?? 0) + 1,
    }));
  }

  const status =
    validation ||
    (search.isFetching
      ? '搜索中…'
      : search.isError
        ? `搜索失败：${search.error.message}`
        : search.isSuccess && search.data.items.length > 0
          ? search.data.total > 1000
            ? `已达上限（${search.data.total} 条），请缩小范围`
            : `找到 ${search.data.total} 条结果`
          : '');

  return (
    <div className="search-overlay-window">
      <header className="search-overlay-titlebar">
        <DialogTitle>高级搜索</DialogTitle>
        <DialogClose aria-label="关闭高级搜索">
          <XIcon aria-hidden="true" />
        </DialogClose>
      </header>
      <form className="search-overlay-body" onSubmit={submit}>
        <DialogDescription className="search-overlay-tip">
          在「{scopeLabel}」范围内搜索。
        </DialogDescription>
        <Field className="search-field">
          <FieldLabel>关键词</FieldLabel>
          <Input
            ref={keywordRef}
            type="search"
            placeholder="输入关键词"
            autoComplete="off"
            value={keyword}
            onValueChange={setKeyword}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && keyword !== '') {
                event.preventDefault();
                setKeyword('');
              }
            }}
          />
        </Field>
        <div className="search-date-row">
          <Field className="search-field">
            <FieldLabel>起止日期</FieldLabel>
            <Input type="date" value={start} onValueChange={setStart} />
          </Field>
          <Field className="search-field">
            <FieldLabel>至</FieldLabel>
            <Input type="date" value={end} onValueChange={setEnd} />
          </Field>
        </div>
        <p className="search-status" role={validation || search.isError ? 'alert' : 'status'}>
          {status}
        </p>
        <div className="search-actions">
          <Button
            type="submit"
            className="search-submit"
            aria-label="搜索"
            disabled={search.isFetching}
          >
            <SearchIcon aria-hidden="true" />
            搜索
          </Button>
        </div>
        <div className="search-results" aria-live="polite">
          {search.isSuccess && search.data.items.length === 0 && (
            <p className="search-empty">未找到匹配微博</p>
          )}
          {search.isSuccess &&
            search.data.items.map((post) => (
              <Button
                type="button"
                className="search-result"
                key={post.mblogId}
                onClick={() => {
                  onClose();
                  onSelectPost(post);
                }}
              >
                <div className="search-result-meta">
                  {formatDate(post.createdAt)} · {post.blogger?.screenName || '未知博主'}
                </div>
                <div className="search-result-snippet">
                  <SearchSnippet post={post} keyword={request!.keyword} />
                </div>
              </Button>
            ))}
        </div>
      </form>
    </div>
  );
}

export default function PostSearch({
  open,
  onOpenChange,
  uid,
  scopeLabel,
  onSelectPost,
  onUnauthorized,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: number | null;
  scopeLabel: string;
  onSelectPost: (post: Post) => void;
  onUnauthorized: () => void;
}) {
  const queryClient = useQueryClient();
  const keywordRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState(0);

  function closeDialog() {
    void queryClient.cancelQueries({ queryKey: ['post', 'search'] });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      container={document.body}
      closeOnOutsidePress={false}
      onOpenChange={(next) => {
        if (!next) {
          closeDialog();
          return;
        }
        setSession((count) => count + 1);
        onOpenChange(true);
      }}
    >
      <DialogTrigger className="search-open" aria-label="高级搜索">
        <SearchIcon aria-hidden="true" />
        高级搜索
      </DialogTrigger>
      <DialogBackdrop className="search-overlay-backdrop" />
      <DialogContent className="search-overlay" initialFocus={() => keywordRef.current}>
        <SearchBody
          key={session}
          uid={uid}
          scopeLabel={scopeLabel}
          keywordRef={keywordRef}
          onClose={closeDialog}
          onSelectPost={onSelectPost}
          onUnauthorized={onUnauthorized}
        />
      </DialogContent>
    </Dialog>
  );
}
