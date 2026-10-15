import type { Video } from './queries';

export type VideoSource = { coverUrl: string; pageUrl: string };

export function playableVideo(video?: Video | null): VideoSource | null {
  const pageUrl = video?.pageUrl;
  const coverUrl = video?.coverUrl;
  if (!pageUrl || !coverUrl || !/^https?:\/\//i.test(pageUrl) || !URL.canParse(pageUrl)) return null;
  if (!/^\/post\/video-cover(?:\?|$)/.test(coverUrl) && !(/^https?:\/\//i.test(coverUrl) && URL.canParse(coverUrl))) return null;
  return { pageUrl, coverUrl };
}
