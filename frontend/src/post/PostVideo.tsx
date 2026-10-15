import type { Video } from './queries';
import { useState } from 'react';

type VideoSource = { coverUrl: string; pageUrl: string };

export function playableVideo(video?: Video | null): VideoSource | null {
  const pageUrl = video?.pageUrl;
  const coverUrl = video?.coverUrl;
  if (!pageUrl || !coverUrl || !/^https?:\/\//i.test(pageUrl) || !URL.canParse(pageUrl)) return null;
  if (!/^\/post\/video-cover(?:\?|$)/.test(coverUrl) && !(/^https?:\/\//i.test(coverUrl) && URL.canParse(coverUrl))) return null;
  return { pageUrl, coverUrl };
}

export default function PostVideo({ video, retweeted = false }: { video: VideoSource; retweeted?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = failedSrc === video.coverUrl;
  return <a className={`post-video${failed ? ' cover-failed' : ''}`} href={video.pageUrl} target="_blank" rel="noopener" aria-label={retweeted ? '播放转发视频' : '播放微博视频'}>
    <img src={video.coverUrl} alt="视频封面" loading="lazy" decoding="async" hidden={failed} onError={() => setFailedSrc(video.coverUrl)} />
    <span className="post-video-play" aria-hidden="true"><span /></span>
  </a>;
}
