import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageText from './MessageText';
import { fetchMessageWeiboCover, fetchMessageWeiboText, messageWeiboVideoUrl } from './api';
import type { ImageSelection } from './ImageViewer';

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
  page_info?: { object_type?: string | null; type?: number | string | null; media_info?: unknown } | null;
  extend_info?: { video_summary?: { video_oid?: string | null } | null } | null;
  retweeted_status?: WeiboStatus | null;
};

export type WeiboUrlObject = {
  status?: WeiboStatus | null;
  url_ori?: string | null;
  info?: { url_long?: string | null } | null;
};

type WeiboReference = { gid: number; mid: number; retweeted: boolean };

function WeiboVideoCover({ id, gid, mid, retweeted, knownVideo }: WeiboReference & {
  id: string; knownVideo: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState('');
  const [loadedSrc, setLoadedSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  useEffect(() => {
    const target = frame.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const { data: cover, isError } = useQuery({
    queryKey: ['chat', 'weibo-cover', id, retweeted],
    queryFn: ({ signal }) => fetchMessageWeiboCover(gid, mid, retweeted, signal),
    enabled: visible,
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!cover) return;
    const url = URL.createObjectURL(cover.image);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  if (!knownVideo && (cover === null || isError)) return null;
  const videoUrl = cover?.pageUrl;
  const href = videoUrl && /^https?:\/\//i.test(videoUrl) && URL.canParse(videoUrl)
    ? videoUrl
    : `https://weibo.com/detail/${encodeURIComponent(id)}`;

  return <>
    <div ref={frame} className="weibo-card-video-cover">
      {playing ? <video src={messageWeiboVideoUrl(gid, mid, retweeted)} controls autoPlay playsInline
        onError={() => { setPlaying(false); setPlayFailed(true); }} />
        : (cover || knownVideo) && <button type="button" className="video-preview"
          aria-label={retweeted ? '播放原微博视频' : '播放微博视频'}
          onClick={() => { setPlayFailed(false); setPlaying(true); }}>
          {src && <img src={src} alt="视频封面" data-loaded={loadedSrc === src}
            onLoad={() => setLoadedSrc(src)} onError={() => setSrc('')} />}
          <span aria-hidden="true">▶</span>
        </button>}
    </div>
    {playFailed && <div role="status">视频播放失败。<a href={href} target="_blank" rel="noopener noreferrer">在浏览器打开</a></div>}
  </>;
}

function WeiboContent({ status, gid, mid, retweeted, onOpenImage }: WeiboReference & {
  status: WeiboStatus; onOpenImage: (selection: ImageSelection) => void;
}) {
  const id = status.idstr || '';
  const needsLongText = Boolean(status.isLongText);
  const longText = useQuery({
    queryKey: ['chat', 'weibo-text', id || `${gid}:${mid}:${retweeted}`],
    queryFn: ({ signal }) => fetchMessageWeiboText(gid, mid, signal, retweeted),
    enabled: needsLongText,
    staleTime: Infinity,
  });
  const preview = (status.text ?? '').replace(/<[^>]+>/g, '').trim();
  const text = needsLongText ? longText.data ?? preview : preview;
  const knownVideo = status.page_info?.object_type === 'video' || Boolean(status.page_info?.media_info)
    || String(status.page_info?.type) === '5' || Boolean(status.extend_info?.video_summary?.video_oid);
  const hasVideoHint = knownVideo || /https?:\/\/t\.cn\/[a-z0-9]+/i.test(preview);
  const author = status.user?.screen_name?.trim() ?? '';
  const avatar = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url;
  const firstPicture = status.original_pic || status.bmiddle_pic || status.thumbnail_pic || '';
  const base = firstPicture ? firstPicture.slice(0, firstPicture.lastIndexOf('/')) : 'https://wx1.sinaimg.cn/large';
  const pictures = status.pic_ids?.length
    ? status.pic_ids.map(pid => `${base}/${encodeURIComponent(pid)}.jpg`)
    : firstPicture ? [firstPicture] : [];
  const proxyUrl = (url: string) => `/chat/image?${new URLSearchParams({ url })}`;
  const images = pictures.map(url => ({
    url: proxyUrl(url.replace(/\/(thumbnail|bmiddle)\//, '/large/')),
    previewUrl: proxyUrl(url.replace(/\/(thumbnail|large)\//, '/bmiddle/')),
  }));

  return <>
    {author && <div className="weibo-card-header">
      <Avatar className="weibo-card-avatar" name={author} avatar={avatar} />
      <div className="weibo-card-author">{author}</div>
    </div>}
    {text && <div className="weibo-card-summary"><MessageText text={text} /></div>}
    {needsLongText && longText.isFetching && <div role="status">正在加载微博全文……</div>}
    {needsLongText && longText.isError && <div role="alert">
      微博全文加载失败，当前仅显示预览。
      <button type="button" className="weibo-card-retry" onClick={() => { void longText.refetch(); }}>重试加载全文</button>
    </div>}
    {id && hasVideoHint && <WeiboVideoCover key={id} id={id} gid={gid} mid={mid}
      retweeted={retweeted} knownVideo={knownVideo} />}
    {pictures.length > 0 && <div className="weibo-card-pictures">
      {images.map((image, index) => <button key={image.url} type="button" className="weibo-card-picture"
        aria-label={`查看微博图片 ${index + 1}`}
        onClick={() => onOpenImage({ images, index })}>
        <img src={image.previewUrl} alt="" loading="lazy" />
      </button>)}
    </div>}
  </>;
}

export default function WeiboCard({ urlObject, gid, mid, onOpenImage }: {
  urlObject: WeiboUrlObject; gid: number; mid: number; onOpenImage: (selection: ImageSelection) => void;
}) {
  const status = urlObject.status ?? {};
  const link = urlObject.url_ori || urlObject.info?.url_long || '';
  const href = /^https?:\/\//i.test(link) ? link : '';

  return (
    <div className="bubble weibo-card">
      <WeiboContent status={status} gid={gid} mid={mid} retweeted={false} onOpenImage={onOpenImage} />
      {status.retweeted_status && <div className="weibo-card-retweet">
        <WeiboContent status={status.retweeted_status} gid={gid} mid={mid} retweeted onOpenImage={onOpenImage} />
      </div>}
      {href && (
        <a className="weibo-card-link" href={href} target="_blank" rel="noopener noreferrer">查看微博</a>
      )}
    </div>
  );
}
