import { useQuery } from '@tanstack/react-query';
import Avatar from './Avatar';
import MessageText from './MessageText';
import { fetchMessageWeiboText } from './api';

type WeiboStatus = {
  idstr?: string | null;
  isLongText?: boolean;
  user?: {
    screen_name?: string | null;
    avatar_hd?: string | null;
    avatar_large?: string | null;
    profile_image_url?: string | null;
  } | null;
  text?: string | null;
  pic_ids?: string[] | null;
  original_pic?: string | null;
  bmiddle_pic?: string | null;
  thumbnail_pic?: string | null;
  retweeted_status?: WeiboStatus | null;
};

export type WeiboUrlObject = {
  status?: WeiboStatus | null;
  url_ori?: string | null;
  info?: { url_long?: string | null } | null;
};

function WeiboContent({ status, text, onOpenImage }: {
  status: WeiboStatus; text: string; onOpenImage: (url: string) => void;
}) {
  const author = status.user?.screen_name?.trim() ?? '';
  const avatar = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url;
  const firstPicture = status.original_pic || status.bmiddle_pic || status.thumbnail_pic || '';
  const base = firstPicture ? firstPicture.slice(0, firstPicture.lastIndexOf('/')) : 'https://wx1.sinaimg.cn/large';
  const pictures = status.pic_ids?.length
    ? status.pic_ids.map(pid => `${base}/${encodeURIComponent(pid)}.jpg`)
    : firstPicture ? [firstPicture] : [];
  const proxyUrl = (url: string) => `/chat/image?${new URLSearchParams({ url })}`;

  return <>
    {author && <div className="weibo-card-header">
      <Avatar className="weibo-card-avatar" name={author} avatar={avatar} />
      <div className="weibo-card-author">{author}</div>
    </div>}
    {text && <div className="weibo-card-summary"><MessageText text={text} /></div>}
    {pictures.length > 0 && <div className="weibo-card-pictures">
      {pictures.map((url, index) => <button key={url} type="button" className="weibo-card-picture"
        aria-label={`查看微博图片 ${index + 1}`}
        onClick={() => onOpenImage(proxyUrl(url.replace(/\/(thumbnail|bmiddle)\//, '/large/')))}>
        <img src={proxyUrl(url.replace(/\/(thumbnail|large)\//, '/bmiddle/'))} alt="" loading="lazy" />
      </button>)}
    </div>}
  </>;
}

export default function WeiboCard({ urlObject, gid, mid, onOpenImage }: {
  urlObject: WeiboUrlObject; gid: number; mid: number; onOpenImage: (url: string) => void;
}) {
  const status = urlObject.status ?? {};
  const id = status.idstr ?? '';
  const needsLongText = Boolean(status.isLongText);
  const longText = useQuery({
    queryKey: ['chat', 'weibo-text', id || `${gid}:${mid}`],
    queryFn: ({ signal }) => fetchMessageWeiboText(gid, mid, signal),
    enabled: needsLongText,
    staleTime: Infinity,
  });
  const preview = (status.text ?? '').replace(/<[^>]+>/g, '').trim();
  const text = needsLongText ? longText.data ?? preview : preview;
  const link = urlObject.url_ori || urlObject.info?.url_long || '';
  const href = /^https?:\/\//i.test(link) ? link : '';

  return (
    <div className="bubble weibo-card">
      <WeiboContent status={status} text={text} onOpenImage={onOpenImage} />
      {needsLongText && longText.isFetching && <div role="status">正在加载微博全文……</div>}
      {needsLongText && longText.isError && <div role="alert">
        微博全文加载失败，当前仅显示预览。
        <button type="button" onClick={() => { void longText.refetch(); }}>重试加载全文</button>
      </div>}
      {status.retweeted_status && <div className="weibo-card-retweet">
        <WeiboContent status={status.retweeted_status}
          text={(status.retweeted_status.text ?? '').replace(/<[^>]+>/g, '').trim()}
          onOpenImage={onOpenImage} />
      </div>}
      {href && (
        <a className="weibo-card-link" href={href} target="_blank" rel="noopener noreferrer">查看微博</a>
      )}
    </div>
  );
}
