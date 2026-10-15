import { useState } from 'react';
import type { VideoSource } from './video';

export default function PostVideo({ video, retweeted = false }: { video: VideoSource; retweeted?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = failedSrc === video.coverUrl;
  return <a className={`post-video${failed ? ' cover-failed' : ''}`} href={video.pageUrl} target="_blank" rel="noopener" aria-label={retweeted ? '播放转发视频' : '播放微博视频'}>
    <img src={video.coverUrl} alt="视频封面" loading="lazy" decoding="async" hidden={failed} onError={() => setFailedSrc(video.coverUrl)} />
    <span className="post-video-play" aria-hidden="true"><span /></span>
  </a>;
}
