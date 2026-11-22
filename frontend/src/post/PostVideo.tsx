import { useState } from 'react';
import type { VideoSource } from './video';

export default function PostVideo({ video, mblogId, retweeted = false }: {
  video: VideoSource; mblogId: string; retweeted?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const failed = failedSrc === video.coverUrl;
  if (playing) {
    const query = new URLSearchParams({ mblogId });
    if (retweeted) query.set('retweeted', 'true');
    return <video className="post-video-player" src={`/post/video?${query}`} controls autoPlay playsInline
      onError={() => { setPlaying(false); setPlayFailed(true); }} />;
  }
  return <>
    <button type="button" className={`post-video${failed ? ' cover-failed' : ''}`}
      aria-label={retweeted ? '播放转发视频' : '播放微博视频'}
      onClick={() => { setPlayFailed(false); setPlaying(true); }}>
      <img src={video.coverUrl} alt="视频封面" loading="lazy" decoding="async" hidden={failed} onError={() => setFailedSrc(video.coverUrl)} />
      <span className="post-video-play" aria-hidden="true"><span /></span>
    </button>
    {playFailed && <div role="status">视频播放失败。<a href={video.pageUrl} target="_blank" rel="noopener">在浏览器打开</a></div>}
  </>;
}
