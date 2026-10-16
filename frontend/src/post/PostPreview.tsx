import { useState } from 'react';
import { useDefaultReading, type Blogger } from './queries';
import PostFeed from './PostFeed';
import DateTimeline from './DateTimeline';
import PostSearch from './PostSearch';
import BloggerAvatar, { VerifiedBadge } from './BloggerAvatar';
import weiboLogo from '../../../src/main/resources/static/post/assets/weibo-logo.svg';

function BloggerList({ bloggers, keyword, selectedUid, onSelect }: {
  bloggers: Blogger[]; keyword: string; selectedUid: number | null; onSelect: (uid: number) => void;
}) {
  const filter = keyword.trim().toLowerCase();
  return <ul className="blogger-list" aria-label="博主">{bloggers.map(blogger => <li key={blogger.uid} hidden={!blogger.screenName.toLowerCase().includes(filter)}>
    <button className="blogger-row" aria-label={blogger.screenName} aria-pressed={selectedUid === blogger.uid} onClick={() => onSelect(blogger.uid)}>
      <BloggerAvatar blogger={blogger} className="blogger-avatar" />
      <span className="blogger-name">{blogger.screenName}{blogger.verified && <VerifiedBadge />}</span>
    </button>
  </li>)}</ul>;
}

export default function PostPreview() {
  const [bloggerSearch, setBloggerSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { bloggers, calendar, months, date, posts, selection, selectDate, selectBlogger } = useDefaultReading();
  const selectedBlogger = bloggers.data?.find(blogger => blogger.uid === selection.uid);
  const formalPage = import.meta.env.DEV ? new URL('/post/index.html', import.meta.env.VITE_API_PROXY_TARGET).href : '/post/index.html';

  return (
    <div className="app">
      <header className="titlebar">
        <span className="title-logo" aria-hidden="true"><img src={weiboLogo} alt="" /></span>
        <h1>本地微博预览</h1>
        <p className="preview-note">完整功能请使用<a href={formalPage}>正式 post 页面</a>。</p>
      </header>
      <main className="columns">
        <section className="bloggers-panel" aria-label="博主区域">
          <header className="bloggers-heading"><h2>博主列表</h2>{bloggers.isSuccess && <span>{bloggers.data.length} 位博主</span>}</header>
          <div className="search-box"><input type="search" aria-label="搜索博主" placeholder="搜索博主" value={bloggerSearch} onChange={event => setBloggerSearch(event.target.value)} /></div>
          <div className="bloggers-list">
            <button className="blogger-row all-bloggers" aria-pressed={selection.uid === null} onClick={() => selectBlogger(null)}>
              <span className="blogger-avatar all-avatar" aria-hidden="true"><img src={weiboLogo} alt="" /></span>
              <span className="blogger-name">全部博主</span>
            </button>
            {bloggers.isPending && <p className="panel-feedback" role="status">正在加载博主……</p>}
            {bloggers.isError && <p className="panel-feedback" role="alert">博主加载失败，请刷新页面重试。（{bloggers.error.message}）</p>}
            {bloggers.isSuccess && bloggers.data.length === 0 && <p className="panel-feedback" role="status">暂无博主。</p>}
            <BloggerList bloggers={bloggers.data ?? []} keyword={bloggerSearch} selectedUid={selection.uid} onSelect={selectBlogger} />
          </div>
        </section>
        <section className="dates-panel" aria-label="日期区域">
          <header className="dates-heading"><h2>日期</h2></header>
          <div className="dates-list">
            {calendar.isFetching && <p className="panel-feedback" role="status">正在加载日期……</p>}
            {calendar.isError && <p className="panel-feedback" role="alert">日期加载失败，请刷新页面重试。（{calendar.error.message}）</p>}
            {calendar.isSuccess && !date && <p className="panel-feedback" role="status">暂无有博文的日期。</p>}
            {date && <DateTimeline key={selection.visit} months={months} date={date} onSelectDate={selectDate} />}
          </div>
        </section>
        <section className="feed" aria-label="博文区域">
          <header className="feed-header">
            <h2>{selectedBlogger ? `${selectedBlogger.screenName}的微博` : '全部微博'}</h2>
            {posts.isSuccess && !posts.isFetching && <span className="feed-count" aria-label="博文总数">共 {posts.data.total} 条</span>}
            <button type="button" className="search-open" onClick={() => setSearchOpen(true)}>高级搜索</button>
          </header>
          <div className="posts">
            {posts.isFetching && <p role="status">正在加载博文……</p>}
            {posts.isError && <><p role="alert">博文加载失败。（{posts.error.message}）</p><button onClick={() => void posts.refetch()}>重试博文</button></>}
            {posts.isSuccess && !posts.isFetching && <PostFeed result={posts.data} />}
          </div>
        </section>
      </main>
      {searchOpen && <PostSearch uid={selection.uid} scopeLabel={selectedBlogger ? `@${selectedBlogger.screenName}` : '全部博主'} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
