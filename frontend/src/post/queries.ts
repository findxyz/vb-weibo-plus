import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export type Blogger = { uid: number; screenName: string; avatar?: string | null; verified?: boolean };
export type PostImage = { pid: string; thumbnailUrl?: string | null; originalUrl?: string | null; thumbnailWidth?: number; thumbnailHeight?: number; originalWidth?: number; originalHeight?: number };
export type Video = { pageUrl?: string | null; coverUrl?: string | null };
export type Calendar = { months: { month: string; count: number; days: { date: string; count: number }[] }[] };
export type Retweet = { screenName: string | null; content: string | null; pics?: PostImage[] | null; video?: Video | null };
export type Post = { mblogId: string; content: string; contentRaw?: string | null; createdAt: number; blogger: Blogger | null; retweeted?: Retweet | null; pics?: PostImage[] | null; video?: Video | null; source?: string | null; region?: string | null; postUrl?: string | null };
export type PostList = { items: Post[]; page: number; size: number; total: number };

class QueryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function getJson<T>(url: string, signal: AbortSignal, timeoutMs = 15000): Promise<T> {
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (typeof body.msg === 'string' && body.msg) message = body.msg;
      } catch { /* Non-JSON errors retain the HTTP status. */ }
      throw new QueryError(message, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new QueryError('请求超时，请稍后重试', 0);
    }
    throw error;
  }
}

function validMonths(calendar: Calendar | undefined) {
  return (calendar?.months ?? []).map(month => ({ ...month, days: month.days.filter(day => day.count > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && !Number.isNaN(Date.parse(day.date))
    && new Date(day.date).toISOString().slice(0, 10) === day.date).sort((a, b) => b.date.localeCompare(a.date)) }))
    .filter(month => month.days.length > 0).sort((a, b) => b.month.localeCompare(a.month));
}

export type SearchRequest = { keyword: string; start: string; end: string; attempt: number };

export function usePostSearch(uid: number | null, request: SearchRequest | null) {
  return useQuery({
    queryKey: ['post', 'search', uid, request], gcTime: 0, enabled: request !== null,
    queryFn: ({ signal }) => {
      const submitted = request!;
      const params = new URLSearchParams({ keyword: submitted.keyword, page: '1', size: '1000' });
      if (uid !== null) params.set('uids', String(uid));
      if (submitted.start) params.set('start', `${submitted.start} 00:00:00`);
      if (submitted.end) params.set('end', `${submitted.end} 23:59:59`);
      return getJson<PostList>(`/post/list?${params}`, signal, 30000);
    },
  });
}

// https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries
// https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
export function useDefaultReading() {
  const [selection, setSelection] = useState<{ uid: number | null; visit: number }>({ uid: null, visit: 0 });
  const [selectedDate, setSelectedDate] = useState<{ visit: number; value: string }>();
  const bloggers = useQuery({ queryKey: ['post', 'bloggers'], queryFn: ({ signal }) => getJson<Blogger[]>('/post/bloggers', signal) });
  // A visit isolates each explicit scope selection, including selecting the same blogger again.
  // https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
  const calendar = useQuery({
    queryKey: ['post', 'calendar', selection.uid, selection.visit], gcTime: 0,
    enabled: bloggers.isSuccess && bloggers.data.length > 0,
    queryFn: ({ signal }) => getJson<Calendar>(selection.uid === null ? '/post/calendar' : `/post/calendar?uid=${selection.uid}`, signal),
  });
  const months = validMonths(calendar.data);
  const date = selectedDate?.visit === selection.visit ? selectedDate.value : months[0]?.days[0]?.date;
  const posts = useQuery({
    queryKey: ['post', 'list', selection.uid, selection.visit, date], gcTime: 0, enabled: Boolean(date),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: '1', size: '9999', start: `${date} 00:00:00`, end: `${date} 23:59:59` });
      if (selection.uid !== null) params.set('uids', String(selection.uid));
      return getJson<PostList>(`/post/list?${params}`, signal, 30000);
    },
  });
  function selectDate(nextDate: string) {
    if (posts.isFetching) return;
    if (nextDate === date) void posts.refetch();
    else setSelectedDate({ visit: selection.visit, value: nextDate });
  }
  function selectBlogger(uid: number | null) {
    setSelection(previous => ({ uid, visit: previous.visit + 1 }));
  }
  return { bloggers, calendar, months, date, posts, selection, selectDate, selectBlogger };
}
