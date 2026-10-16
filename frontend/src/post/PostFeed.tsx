import { useEffect, useRef, useState } from 'react';
import { sanitizedContent } from './content';
import { formatDate } from '../../../src/main/resources/static/shared/date.js';
import type { PostList } from './queries';
import BloggerAvatar, { VerifiedBadge } from './BloggerAvatar';
import PostImages from './PostImages';
import ImageViewer from './ImageViewer';
import PostVideo from './PostVideo';
import { playableVideo } from './video';

function PostContent({ content, className = 'post-content' }: { content: string; className?: string }) {
  try {
    // Only sanitized HTML reaches React's raw-HTML boundary.
    // https://github.com/cure53/DOMPurify#what-does-it-do
    const clean = sanitizedContent(content);
    return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
  } catch {
    return <div className={className}>{content}</div>;
  }
}

export default function PostFeed({ result, targetPostId }: { result: PostList; targetPostId?: string }) {
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  const [highlighted, setHighlighted] = useState(targetPostId);
  const targetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!targetRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const frame = requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      timer = setTimeout(() => setHighlighted(undefined), 1600);
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [targetPostId]);
  function openImages(images: string[], index: number) { setViewer({ images, index }); }
  return <>
    {result.items.length === 0 && <p role="status">该日无微博。</p>}
    {result.items.map(post => {
      const video = playableVideo(post.video);
      const retweetVideo = playableVideo(post.retweeted?.video);
      const postUrl = post.postUrl && /^https?:\/\//i.test(post.postUrl) && URL.canParse(post.postUrl) ? post.postUrl : null;
      const pureRetweet = !post.content && !post.pics?.length && !(post.video?.pageUrl && post.video.coverUrl) && post.retweeted;
      return <article ref={post.mblogId === targetPostId ? targetRef : null} className={`post-card${pureRetweet ? ' pure-retweet' : ''}${post.mblogId === highlighted ? ' flash-highlight' : ''}`} key={post.mblogId}>
        {!pureRetweet && <BloggerAvatar blogger={post.blogger} className="post-avatar" linkToHomepage />}
        <div className="post-body">
          <header className="post-header">
            <strong className="post-author">{post.blogger?.screenName || '未知博主'}{post.blogger?.verified && <VerifiedBadge />}</strong>
            <time className="post-time" dateTime={new Date(post.createdAt).toISOString()}>{formatDate(post.createdAt)}</time>
            {post.region && <span className="post-region">{post.region}</span>}
            {post.source && <span className="post-source">{post.source}</span>}
          </header>
          {post.content && <PostContent content={post.content} />}
          {post.pics && <PostImages pics={post.pics} onOpen={openImages} />}
          {video && video.pageUrl !== retweetVideo?.pageUrl && <PostVideo video={video} />}
          {post.retweeted && <aside className="post-retweet" aria-label="转发正文">
            <strong className="post-retweet-author">@{post.retweeted.screenName || '未知用户'}</strong>
            <PostContent content={post.retweeted.content ?? ''} className="post-retweet-content" />
            {post.retweeted.pics && <PostImages pics={post.retweeted.pics} retweeted onOpen={openImages} />}
            {retweetVideo && <PostVideo video={retweetVideo} retweeted />}
          </aside>}
          {postUrl && <div className="post-actions"><a className="post-link" href={postUrl} target="_blank" rel="noopener">查看原文</a></div>}
        </div>
      </article>;
    })}
    {viewer && <ImageViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
  </>;
}
