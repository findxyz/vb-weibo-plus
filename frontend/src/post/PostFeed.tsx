import DOMPurify from 'dompurify';
import type { PostList } from './queries';

function PostContent({ content }: { content: string }) {
  try {
    // Only sanitized HTML reaches React's raw-HTML boundary.
    // https://github.com/cure53/DOMPurify#what-does-it-do
    const clean = DOMPurify.sanitize(content, { USE_PROFILES: { html: true } });
    return <div className="post-content" dangerouslySetInnerHTML={{ __html: clean }} />;
  } catch {
    return <div className="post-content">{content}</div>;
  }
}

function shanghaiTime(epoch: number) {
  return new Date(epoch + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
}

export default function PostFeed({ result }: { result: PostList }) {
  return <>
    <p aria-label="博文总数">共 {result.total} 条</p>
    {result.items.length === 0 && <p role="status">该日无微博。</p>}
    {result.items.map(post => <article className="post-card" key={post.mblogId}>
      <header className="post-header"><strong>{post.blogger?.screenName || '未知博主'}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{shanghaiTime(post.createdAt)}</time></header>
      <PostContent content={post.content} />
    </article>)}
  </>;
}
