import { useDefaultReading, type Blogger } from './queries';
import PostFeed from './PostFeed';

function BloggerList({ bloggers }: { bloggers: Blogger[] }) {
  return <ul aria-label="博主">{bloggers.map(blogger => <li key={blogger.uid}>{blogger.screenName}</li>)}</ul>;
}

export default function PostPreview() {
  const { bloggers, calendar, date, posts } = useDefaultReading();
  const formalPage = import.meta.env.DEV ? new URL('/post/index.html', import.meta.env.VITE_API_PROXY_TARGET).href : '/post/index.html';

  return (
    <div className="app">
      <header className="titlebar"><h1>本地微博预览</h1></header>
      <p className="preview-note">当前仅提供默认阅读路径，完整功能请使用<a href={formalPage}>正式 post 页面</a>。</p>
      <main className="columns">
        <section aria-label="博主区域">
        <h2>博主</h2>
        <p className="selected" aria-label="当前范围">全部博主</p>
        {bloggers.isPending && <p role="status">正在加载博主……</p>}
        {bloggers.isError && <p role="alert">博主加载失败，请刷新页面重试。（{bloggers.error.message}）</p>}
        {bloggers.isSuccess && bloggers.data.length === 0 && <p role="status">暂无博主。</p>}
        <BloggerList bloggers={bloggers.data ?? []} />
        </section>
        <section aria-label="日期区域">
          <h2>日期</h2>
          {calendar.isFetching && <p role="status">正在加载日期……</p>}
          {calendar.isError && <p role="alert">日期加载失败，请刷新页面重试。（{calendar.error.message}）</p>}
          {calendar.isSuccess && !date && <p role="status">暂无有博文的日期。</p>}
          {date && <p className="selected" aria-label="当前日期">{date}</p>}
        </section>
        <section className="feed" aria-label="博文区域">
          <h2>全部微博</h2>
          {posts.isFetching && <p role="status">正在加载博文……</p>}
          {posts.isError && <><p role="alert">博文加载失败。（{posts.error.message}）</p><button onClick={() => void posts.refetch()}>重试博文</button></>}
          {posts.isSuccess && <PostFeed result={posts.data} />}
        </section>
      </main>
    </div>
  );
}
