import { useQuery } from '@tanstack/react-query';
import { fetchMessageWeiboText } from './api';

export type WeiboUrlObject = {
  status?: {
    idstr?: string | null;
    isLongText?: boolean;
    user?: { screen_name?: string | null } | null;
    text?: string | null;
  } | null;
  url_ori?: string | null;
  info?: { url_long?: string | null } | null;
};

export default function WeiboCard({ urlObject, gid, mid }: { urlObject: WeiboUrlObject; gid: number; mid: number }) {
  const status = urlObject.status ?? {};
  const id = status.idstr ?? '';
  const needsLongText = Boolean(status.isLongText);
  const longText = useQuery({
    queryKey: ['chat', 'weibo-text', id || `${gid}:${mid}`],
    queryFn: ({ signal }) => fetchMessageWeiboText(gid, mid, signal),
    enabled: needsLongText,
    staleTime: Infinity,
  });
  const author = status.user?.screen_name?.trim() ?? '';
  const preview = (status.text ?? '').replace(/<[^>]+>/g, '').trim();
  const text = needsLongText ? longText.data ?? preview : preview;
  const link = urlObject.url_ori || urlObject.info?.url_long || '';
  const href = /^https?:\/\//i.test(link) ? link : '';

  return (
    <div className="bubble weibo-card">
      {author && <div className="weibo-card-author">{author}</div>}
      {text && <div className="weibo-card-summary">{text}</div>}
      {needsLongText && longText.isFetching && <div role="status">正在加载微博全文……</div>}
      {needsLongText && longText.isError && <div role="alert">
        微博全文加载失败，当前仅显示预览。
        <button type="button" onClick={() => { void longText.refetch(); }}>重试加载全文</button>
      </div>}
      {href && (
        <a className="weibo-card-link" href={href} target="_blank" rel="noopener noreferrer">查看微博</a>
      )}
    </div>
  );
}
