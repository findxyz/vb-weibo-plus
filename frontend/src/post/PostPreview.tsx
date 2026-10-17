import { useEffect, useRef, useState } from 'react';
import { isUnauthorized, useDefaultReading, type Blogger } from './queries';
import { usePostLogin } from './usePostLogin';
import PostLogin from './PostLogin';
import AddBlogger from './AddBlogger';
import SyncHistory from './SyncHistory';
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
  const { bloggers, calendar, months, date, posts, selection, selectDate, selectBlogger, jump, jumpToPost, readingVersion, refreshCalendar } = useDefaultReading();
  const login = usePostLogin();
  const [syncNotice, setSyncNotice] = useState<{ uid: number; visit: number }>();
  const scopeRef = useRef(selection);
  scopeRef.current = selection;
  async function historyCompleted(uid: number, visit: number) {
    if (scopeRef.current.uid !== uid || scopeRef.current.visit !== visit) return;
    const refreshed = await refreshCalendar();
    if (scopeRef.current.uid === uid && scopeRef.current.visit === visit && refreshed.isSuccess) setSyncNotice({ uid, visit });
  }
  async function bloggerAdded(uid: string, select: boolean) {
    const version = readingVersion.current;
    const refreshed = await bloggers.refetch();
    if (select && readingVersion.current === version && refreshed.isSuccess && refreshed.data.some(blogger => blogger.uid === Number(uid))) selectBlogger(Number(uid));
  }
  useEffect(() => {
    if ([bloggers.error, calendar.error, posts.error].some(isUnauthorized)) login.expire();
  }, [bloggers.error, calendar.error, posts.error, login.expire]);
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
          <header className="bloggers-heading"><h2>博主列表</h2>{bloggers.isSuccess && <span>{bloggers.data.length} 位博主</span>}<AddBlogger onAdded={bloggerAdded} onUnauthorized={login.expire} /></header>
          <div className="search-box"><input type="search" aria-label="搜索博主" placeholder="搜索博主" value={bloggerSearch} onChange={event => setBloggerSearch(event.target.value)} /></div>
          <div className="bloggers-list">
            <button className="blogger-row all-bloggers" aria-pressed={selection.uid === null} onClick={() => selectBlogger(null)}>
              <span className="blogger-avatar all-avatar" aria-hidden="true"><img src={weiboLogo} alt="" /></span>
              <span className="blogger-name">全部博主</span>
            </button>
            {bloggers.isPending && <p className="panel-feedback" role="status">正在加载博主……</p>}
            {bloggers.isError && !isUnauthorized(bloggers.error) && <p className="panel-feedback" role="alert">博主加载失败，请刷新页面重试。（{bloggers.error.message}）</p>}
            {bloggers.isSuccess && bloggers.data.length === 0 && <p className="panel-feedback" role="status">暂无博主。</p>}
            <BloggerList bloggers={bloggers.data ?? []} keyword={bloggerSearch} selectedUid={selection.uid} onSelect={selectBlogger} />
          </div>
          {login.expired && <PostLogin pending={login.pending} started={login.started} message={login.message} onStart={login.start} />}
        </section>
        <section className="dates-panel" aria-label="日期区域">
          <header className="dates-heading"><h2>日期</h2>{syncNotice?.uid === selection.uid && syncNotice?.visit === selection.visit && <span className="sync-notice" role="status">同步完成</span>}</header>
          <div className="dates-list">
            {calendar.isFetching && <p className="panel-feedback" role="status">正在加载日期……</p>}
            {calendar.isError && !isUnauthorized(calendar.error) && <p className="panel-feedback" role="alert">日期加载失败，请刷新页面重试。（{calendar.error.message}）</p>}
            {calendar.isSuccess && !date && <p className="panel-feedback" role="status">暂无有博文的日期。</p>}
            {date && <DateTimeline key={selection.visit} months={months} date={date} reveal={jump} onSelectDate={selectDate} />}
          </div>
        </section>
        <section className="feed" aria-label="博文区域">
          <header className="feed-header">
            <h2>{selectedBlogger ? `${selectedBlogger.screenName}的微博` : '全部微博'}</h2>
            {posts.isSuccess && !posts.isFetching && <span className="feed-count" aria-label="博文总数">共 {posts.data.total} 条</span>}
            <SyncHistory blogger={selectedBlogger} visit={selection.visit} onStart={() => setSyncNotice(undefined)} onComplete={historyCompleted} onUnauthorized={login.expire} />
            <button type="button" className="search-open" onClick={() => setSearchOpen(true)}>高级搜索</button>
          </header>
          <div className="posts">
            {posts.isFetching && <p role="status">正在加载博文……</p>}
            {posts.isError && !isUnauthorized(posts.error) && <><p role="alert">博文加载失败。（{posts.error.message}）</p><button onClick={() => void posts.refetch()}>重试博文</button></>}
            {posts.isSuccess && !posts.isFetching && <PostFeed result={posts.data} targetPostId={jump?.mblogId} />}
          </div>
        </section>
      </main>
      {searchOpen && <PostSearch uid={selection.uid} scopeLabel={selectedBlogger ? `@${selectedBlogger.screenName}` : '全部博主'} onClose={() => setSearchOpen(false)} onSelectPost={jumpToPost} onUnauthorized={login.expire} />}
    </div>
  );
}
