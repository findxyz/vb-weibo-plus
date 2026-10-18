import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDate, isDateRangeValid, shanghaiToday } from '../shared/date.js';
import { isUnauthorized, usePostSearch, type Post, type SearchRequest } from './queries';

function SearchSnippet({ post, keyword }: { post: Post; keyword: string }) {
  const text = (post.contentRaw || new DOMParser().parseFromString(post.content || '', 'text/html').body.textContent || '').trim();
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return <>{text.slice(0, 80)}</>;
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + keyword.length + 30);
  return <>{start > 0 && '…'}{text.slice(start, index)}<mark>{text.slice(index, index + keyword.length)}</mark>{text.slice(index + keyword.length, end)}{end < text.length && '…'}</>;
}

export default function PostSearch({ uid, scopeLabel, onClose, onSelectPost, onUnauthorized }: { uid: number | null; scopeLabel: string; onClose: () => void; onSelectPost: (post: Post) => void; onUnauthorized: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keywordRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState('');
  const [start, setStart] = useState('2010-01-01');
  const [end, setEnd] = useState(shanghaiToday);
  const [validation, setValidation] = useState('');
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const search = usePostSearch(uid, request);
  useEffect(() => {
    if (isUnauthorized(search.error)) { onUnauthorized(); dialogRef.current?.close(); }
  }, [search.error, onUnauthorized]);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    keywordRef.current!.focus();
    return () => dialog.close();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (search.isFetching) return;
    const trimmed = keyword.trim();
    if (!trimmed) { setValidation('请输入关键词。'); return; }
    if (!isDateRangeValid(start, end)) { setValidation('开始日期不能晚于结束日期。'); return; }
    setValidation('');
    setRequest(previous => ({ keyword: trimmed, start, end, attempt: (previous?.attempt ?? 0) + 1 }));
  }

  const status = validation || (search.isFetching ? '搜索中…' : search.isError ? `搜索失败：${search.error.message}`
    : search.isSuccess && search.data.items.length > 0 ? search.data.total > 1000 ? `已达上限（${search.data.total} 条），请缩小范围` : `找到 ${search.data.total} 条结果` : '');
  return <dialog ref={dialogRef} className="search-overlay" aria-labelledby="search-overlay-title" onClose={onClose}>
    <div className="search-overlay-window">
      <header className="search-overlay-titlebar">
        <h2 id="search-overlay-title">高级搜索</h2>
        <button type="button" aria-label="关闭高级搜索" onClick={() => dialogRef.current!.close()} />
      </header>
      <form className="search-overlay-body" onSubmit={submit}>
        <p className="search-overlay-tip">在「{scopeLabel}」范围内搜索。</p>
        <label className="search-field">关键词<input ref={keywordRef} type="search" placeholder="输入关键词" autoComplete="off" value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
        <div className="search-date-row">
          <label className="search-field">起止日期<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
          <label className="search-field">至<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
        </div>
        <p className="search-status" role={validation || search.isError ? 'alert' : 'status'}>{status}</p>
        <div className="search-actions"><button type="submit" className="search-submit" disabled={search.isFetching}>搜索</button></div>
        <div className="search-results" aria-live="polite">
          {search.isSuccess && search.data.items.length === 0 && <p className="search-empty">未找到匹配微博</p>}
          {search.isSuccess && search.data.items.map(post => <button type="button" className="search-result" key={post.mblogId} onClick={() => { dialogRef.current!.close(); onSelectPost(post); }}>
            <div className="search-result-meta">{formatDate(post.createdAt)} · {post.blogger?.screenName || '未知博主'}</div>
            <div className="search-result-snippet"><SearchSnippet post={post} keyword={request!.keyword} /></div>
          </button>)}
        </div>
      </form>
    </div>
  </dialog>;
}
