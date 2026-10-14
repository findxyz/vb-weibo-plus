import { sanitizedContent } from './content';
import { formatDate } from '../../../src/main/resources/static/shared/date.js';
import type { PostList } from './queries';
import BloggerAvatar, { VerifiedBadge } from './BloggerAvatar';

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

export default function PostFeed({ result }: { result: PostList }) {
  return <>
    {result.items.length === 0 && <p role="status">该日无微博。</p>}
    {result.items.map(post => {
      const pureRetweet = !post.content && !post.pics?.length && !(post.video?.pageUrl && post.video.coverUrl) && post.retweeted;
      return <article className={`post-card${pureRetweet ? ' pure-retweet' : ''}`} key={post.mblogId}>
        {!pureRetweet && <BloggerAvatar blogger={post.blogger} className="post-avatar" />}
        <div className="post-body">
          <header className="post-header">
            <strong className="post-author">{post.blogger?.screenName || '未知博主'}{post.blogger?.verified && <VerifiedBadge />}</strong>
            <time className="post-time" dateTime={new Date(post.createdAt).toISOString()}>{formatDate(post.createdAt)}</time>
          </header>
          {post.content && <PostContent content={post.content} />}
          {post.retweeted && <aside className="post-retweet" aria-label="转发正文">
            <strong className="post-retweet-author">@{post.retweeted.screenName || '未知用户'}</strong>
            <PostContent content={post.retweeted.content ?? ''} className="post-retweet-content" />
          </aside>}
        </div>
      </article>;
    })}
  </>;
}
