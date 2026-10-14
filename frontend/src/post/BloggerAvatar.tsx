import { useState } from 'react';
import type { Blogger } from './queries';

export default function BloggerAvatar({ blogger, className }: { blogger: Blogger | null; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = blogger?.avatar;
  const showImage = src && URL.canParse(src) && /^https?:\/\//i.test(src) && src !== failedSrc;
  return <span className={className} aria-hidden="true">
    {showImage ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : (blogger?.screenName || '?').charAt(0)}
  </span>;
}

export function VerifiedBadge() {
  return <span className="verified-badge" role="img" aria-label="已认证" />;
}
