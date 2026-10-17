export type WeiboUrlObject = {
  status?: {
    user?: { screen_name?: string | null } | null;
    text?: string | null;
  } | null;
  url_ori?: string | null;
  info?: { url_long?: string | null } | null;
};

const SUMMARY_LIMIT = 100;

export default function WeiboCard({ urlObject }: { urlObject: WeiboUrlObject }) {
  const status = urlObject.status ?? {};
  const author = status.user?.screen_name?.trim() ?? '';
  const raw = (status.text ?? '').replace(/<[^>]+>/g, '').trim();
  const summary = raw.length > SUMMARY_LIMIT ? `${raw.slice(0, SUMMARY_LIMIT)}…` : raw;
  const link = urlObject.url_ori || urlObject.info?.url_long || '';
  const href = /^https?:\/\//i.test(link) ? link : '';

  return (
    <div className="bubble weibo-card">
      {author && <div className="weibo-card-author">{author}</div>}
      {summary && <div className="weibo-card-summary">{summary}</div>}
      {href && (
        <a className="weibo-card-link" href={href} target="_blank" rel="noopener noreferrer">查看微博</a>
      )}
    </div>
  );
}
