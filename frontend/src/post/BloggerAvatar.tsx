import { useState } from 'react';
import type { Blogger } from './queries';

export default function BloggerAvatar({ blogger, className, linkToHomepage = false }: { blogger: Blogger | null; className: string; linkToHomepage?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = blogger?.avatar;
  const showImage = src && URL.canParse(src) && /^https?:\/\//i.test(src) && src !== failedSrc;
  const content = showImage ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : (blogger?.screenName || '?').charAt(0);
  const uid = blogger?.uid;
  if (linkToHomepage && uid !== undefined && Number.isSafeInteger(uid) && uid > 0) {
    const label = `前往 ${blogger?.screenName || '博主'} 的微博首页`;
    return <a className={className} href={`https://weibo.com/u/${uid}`} target="_blank" rel="noopener" aria-label={label} title={label}>{content}</a>;
  }
  return <span className={className} aria-hidden="true">{content}</span>;
}

export function VerifiedBadge() {
  return <span className="verified-badge" role="img" aria-label="已认证" />;
}
