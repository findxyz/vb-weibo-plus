import { Avatar, AvatarFallback, AvatarImage } from '@ui-sdk/react/avatar';
import { BadgeCheckIcon } from 'lucide-react';
import { useState } from 'react';
import type { Blogger } from './queries';

export default function BloggerAvatar({
  blogger,
  className,
  linkToHomepage = false,
}: {
  blogger: Blogger | null;
  className: string;
  linkToHomepage?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = blogger?.avatar;
  const showImage = src && URL.canParse(src) && /^https?:\/\//i.test(src) && src !== failedSrc;

  function handleLoadingStatusChange(status: 'idle' | 'loading' | 'loaded' | 'error') {
    if (status === 'error' && showImage) setFailedSrc(src);
  }

  const children = (
    <>
      {showImage && (
        <AvatarImage
          src={`/chat/image?${new URLSearchParams({ url: src })}`}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      <AvatarFallback>{(blogger?.screenName || '?').charAt(0)}</AvatarFallback>
    </>
  );

  const uid = blogger?.uid;
  if (linkToHomepage && uid !== undefined && Number.isSafeInteger(uid) && uid > 0) {
    const label = `前往 ${blogger?.screenName || '博主'} 的微博首页`;
    return (
      <Avatar
        className={className}
        onLoadingStatusChange={handleLoadingStatusChange}
        render={
          <a
            href={`https://weibo.com/u/${uid}`}
            target="_blank"
            rel="noopener"
            aria-label={label}
            title={label}
          />
        }
      >
        {children}
      </Avatar>
    );
  }
  return (
    <Avatar
      className={className}
      aria-hidden="true"
      onLoadingStatusChange={handleLoadingStatusChange}
    >
      {children}
    </Avatar>
  );
}

export function VerifiedBadge() {
  return <BadgeCheckIcon className="verified-badge" role="img" aria-label="已认证" />;
}
