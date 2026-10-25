export type WeiboUrlObject = {
  status?: {
    user?: { screen_name?: string | null } | null;
    text?: string | null;
  } | null;
  url_ori?: string | null;
  info?: { url_long?: string | null } | null;
};

export default function WeiboCard({ urlObject }: { urlObject: WeiboUrlObject }) {
  const status = urlObject.status ?? {};
  const author = status.user?.screen_name?.trim() ?? '';
  const text = (status.text ?? '').replace(/<[^>]+>/g, '').trim();
  const link = urlObject.url_ori || urlObject.info?.url_long || '';
  const href = /^https?:\/\//i.test(link) ? link : '';

  return (
    <div className="bubble weibo-card">
      {author && <div className="weibo-card-author">{author}</div>}
      {text && <div className="weibo-card-summary">{text}</div>}
      {href && (
        <a className="weibo-card-link" href={href} target="_blank" rel="noopener noreferrer">查看微博</a>
      )}
    </div>
  );
}
