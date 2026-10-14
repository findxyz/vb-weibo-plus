import { useState } from 'react';
import type { PostImage } from './queries';

function imageUrl(value?: string | null) {
  if (!value) return;
  if (/^\/post\/image(?:\?|$)/.test(value)) return value;
  if (/^https?:\/\//i.test(value) && URL.canParse(value)) return value;
}

function ImageCell({ pic, src, retweeted }: { pic: PostImage; src: string; retweeted: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const width = pic.thumbnailWidth || pic.originalWidth || 0;
  const height = pic.thumbnailHeight || pic.originalHeight || 0;
  const hasSize = !retweeted && width > 0 && height > 0;
  return <span className={retweeted ? 'post-retweet-pic' : 'post-pic'} hidden={failedSrc === src}>
    <img src={src} alt={retweeted ? '转发微博图片' : '微博图片'} loading="lazy" decoding="async"
      width={hasSize ? width : undefined} height={hasSize ? height : undefined} onError={() => setFailedSrc(src)} />
  </span>;
}

export default function PostImages({ pics, retweeted = false }: { pics: PostImage[]; retweeted?: boolean }) {
  const images = pics.flatMap(pic => {
    const src = imageUrl(pic.thumbnailUrl) || imageUrl(pic.originalUrl);
    return src ? [{ pic, src }] : [];
  });
  if (!images.length) return null;
  return <div className={retweeted ? 'post-retweet-pics' : `post-pics${pics.length === 1 ? ' one-image' : ''}`}>{images.map(({ pic, src }, index) =>
    <ImageCell key={`${pic.pid}-${index}`} pic={pic} src={src} retweeted={retweeted} />)}
  </div>;
}
