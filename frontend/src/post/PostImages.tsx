import { useState } from 'react';
import type { PostImage } from './queries';

function imageUrl(value?: string | null) {
  if (!value) return;
  if (/^\/post\/image(?:\?|$)/.test(value)) return value;
  if (/^https?:\/\//i.test(value) && URL.canParse(value)) return value;
}

function ImageCell({ pic, src, retweeted, index, onOpen }: { pic: PostImage; src: string; retweeted: boolean; index: number; onOpen: () => void }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const width = pic.thumbnailWidth || pic.originalWidth || 0;
  const height = pic.thumbnailHeight || pic.originalHeight || 0;
  const hasSize = !retweeted && width > 0 && height > 0;
  return <button type="button" className={retweeted ? 'post-retweet-pic' : 'post-pic'} hidden={failedSrc === src}
    aria-label={`查看${retweeted ? '转发' : ''}微博图片 ${index + 1}`} aria-haspopup="dialog" onClick={onOpen}>
    <img src={src} alt={retweeted ? '转发微博图片' : '微博图片'} loading="lazy" decoding="async"
      width={hasSize ? width : undefined} height={hasSize ? height : undefined} onError={() => setFailedSrc(src)} />
  </button>;
}

export default function PostImages({ pics, retweeted = false, onOpen }: { pics: PostImage[]; retweeted?: boolean; onOpen: (images: string[], index: number) => void }) {
  const images = pics.flatMap(pic => {
    const src = imageUrl(pic.thumbnailUrl) || imageUrl(pic.originalUrl);
    return src ? [{ pic, src, original: imageUrl(pic.originalUrl) || src }] : [];
  });
  if (!images.length) return null;
  return <div className={retweeted ? 'post-retweet-pics' : `post-pics${pics.length === 1 ? ' one-image' : ''}`}>{images.map(({ pic, src }, index) =>
    <ImageCell key={`${pic.pid}-${index}`} pic={pic} src={src} retweeted={retweeted} index={index}
      onOpen={() => onOpen(images.map(image => image.original), index)} />)}
  </div>;
}
