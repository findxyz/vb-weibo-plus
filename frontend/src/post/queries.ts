import { useQuery } from '@tanstack/react-query';

export type Blogger = { uid: number; screenName: string };
export type Calendar = { months: { month: string; count: number; days: { date: string; count: number }[] }[] };
export type Post = { mblogId: string; content: string; createdAt: number; blogger: Blogger | null };
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

function latestDay(calendar: Calendar | undefined) {
  return calendar?.months.flatMap(month => month.days).map(day => day.date)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
      && new Date(date).toISOString().slice(0, 10) === date).sort().at(-1);
}

// https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries
// https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
export function useDefaultReading() {
  const bloggers = useQuery({ queryKey: ['post', 'bloggers'], queryFn: ({ signal }) => getJson<Blogger[]>('/post/bloggers', signal) });
  const calendar = useQuery({
    queryKey: ['post', 'calendar', 'all'], enabled: bloggers.isSuccess && bloggers.data.length > 0,
    queryFn: ({ signal }) => getJson<Calendar>('/post/calendar', signal),
  });
  const date = latestDay(calendar.data);
  const posts = useQuery({
    queryKey: ['post', 'list', 'all', date], enabled: Boolean(date),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: '1', size: '9999', start: `${date} 00:00:00`, end: `${date} 23:59:59` });
      return getJson<PostList>(`/post/list?${params}`, signal, 30000);
    },
  });
  return { bloggers, calendar, date, posts };
}
