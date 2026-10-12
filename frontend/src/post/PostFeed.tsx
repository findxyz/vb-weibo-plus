import { sanitizedContent } from './content';
import { formatDate } from '../../../src/main/resources/static/shared/date.js';
import type { PostList } from './queries';

function PostContent({ content }: { content: string }) {
  try {
    // Only sanitized HTML reaches React's raw-HTML boundary.
    // https://github.com/cure53/DOMPurify#what-does-it-do
    const clean = sanitizedContent(content);
    return <div className="post-content" dangerouslySetInnerHTML={{ __html: clean }} />;
  } catch {
    return <div className="post-content">{content}</div>;
  }
}

export default function PostFeed({ result }: { result: PostList }) {
  return <>
    <p className="feed-count" aria-label="博文总数">共 {result.total} 条</p>
    {result.items.length === 0 && <p role="status">该日无微博。</p>}
    {result.items.map(post => <article className="post-card" key={post.mblogId}>
      <header className="post-header"><strong>{post.blogger?.screenName || '未知博主'}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{formatDate(post.createdAt)}</time></header>
      <PostContent content={post.content} />
    </article>)}
  </>;
}
