import { sanitizedContent } from './content';
import { formatDate } from '../../../src/main/resources/static/shared/date.js';
import type { PostList } from './queries';

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
    <p className="feed-count" aria-label="博文总数">共 {result.total} 条</p>
    {result.items.length === 0 && <p role="status">该日无微博。</p>}
    {result.items.map(post => <article className="post-card" key={post.mblogId}>
      <header className="post-header"><strong>{post.blogger?.screenName || '未知博主'}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{formatDate(post.createdAt)}</time></header>
      {post.content && <PostContent content={post.content} />}
      {post.retweeted && <aside className="post-retweet" aria-label="转发正文">
        <strong className="post-retweet-author">@{post.retweeted.screenName || '未知用户'}</strong>
        <PostContent content={post.retweeted.content ?? ''} className="post-retweet-content" />
      </aside>}
    </article>)}
  </>;
}
