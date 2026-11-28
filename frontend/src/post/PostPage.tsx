import { Button } from '@ui-sdk/react/button';
import { Input, InputClear, InputGroup } from '@ui-sdk/react/input';
import {
  ArrowDownIcon,
  MessageSquareIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import weiboLogo from '../shared/assets/weibo-logo.svg';
import AddBlogger from './AddBlogger';
import BloggerAvatar, { VerifiedBadge } from './BloggerAvatar';
import DateCalendar from './DateCalendar';
import PostFeed from './PostFeed';
import PostLogin from './PostLogin';
import PostSearch from './PostSearch';
import { type Blogger, isUnauthorized, useDefaultReading } from './queries';
import SyncHistory from './SyncHistory';
import { usePostLogin } from './usePostLogin';
import { usePostTheme } from './usePostTheme';

function BloggerList({
  bloggers,
  keyword,
  selectedUid,
  onSelect,
}: {
  bloggers: Blogger[];
  keyword: string;
  selectedUid: number | null;
  onSelect: (uid: number) => void;
}) {
  const filter = keyword.trim().toLowerCase();
  return (
    <ul className="blogger-list" aria-label="博主">
      {bloggers.map((blogger) => (
        <li key={blogger.uid} hidden={!blogger.screenName.toLowerCase().includes(filter)}>
          <Button
            type="button"
            className="blogger-row"
            aria-label={blogger.screenName}
            aria-pressed={selectedUid === blogger.uid}
            onClick={() => onSelect(blogger.uid)}
          >
            <BloggerAvatar blogger={blogger} className="blogger-avatar" />
            <span className="blogger-name">
              {blogger.screenName}
              {blogger.verified && <VerifiedBadge />}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function PostPage() {
  const { theme, toggleTheme } = usePostTheme();
  const [bloggerSearch, setBloggerSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    bloggers,
    calendar,
    months,
    date,
    posts,
    selection,
    selectDate,
    selectBlogger,
    jump,
    jumpToPost,
    readingVersion,
  } = useDefaultReading();
  const scrollIntent = useRef(false);
  const readingKey = `${selection.visit}:${date}:${readingVersion.current}`;
  useEffect(() => {
    scrollIntent.current = false;
  }, [readingKey]);
  function loadEarlier(element: HTMLDivElement) {
    if (
      !scrollIntent.current ||
      searchOpen ||
      document.querySelector('[data-slot="dialog-content"][data-open]') ||
      posts.isFetching ||
      posts.isFetchNextPageError ||
      !posts.hasNextPage ||
      element.scrollHeight - element.scrollTop - element.clientHeight > 32
    )
      return;
    scrollIntent.current = false;
    void posts.fetchNextPage({ cancelRefetch: false });
  }
  const loadedCount = posts.data?.pages.reduce((count, page) => count + page.items.length, 0) ?? 0;
  const totalCount = posts.data?.pages.reduce((count, page) => count + page.total, 0) ?? 0;
  const login = usePostLogin();
  async function bloggerAdded(uid: string, select: boolean) {
    const version = readingVersion.current;
    const refreshed = await bloggers.refetch();
    if (
      select &&
      readingVersion.current === version &&
      refreshed.isSuccess &&
      refreshed.data.some((blogger) => blogger.uid === Number(uid))
    )
      selectBlogger(Number(uid));
  }
  useEffect(() => {
    if ([bloggers.error, calendar.error, posts.error].some(isUnauthorized)) login.expire();
  }, [bloggers.error, calendar.error, posts.error, login.expire]);
  const selectedBlogger = bloggers.data?.find((blogger) => blogger.uid === selection.uid);

  return (
    <div className="app">
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <main className="columns">
        <aside className="bloggers-sidebar" aria-label="博主导航">
          <section className="bloggers-panel" aria-label="博主区域">
            <header className="bloggers-heading">
              <h2>博主管理</h2>
              {bloggers.isSuccess && <span>{bloggers.data.length} 位博主</span>}
            </header>
            <div className="search-box">
              <InputGroup className="search-box-group">
                <SearchIcon aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="搜索博主"
                  placeholder="搜索博主"
                  value={bloggerSearch}
                  onValueChange={setBloggerSearch}
                />
                <InputClear tabIndex={-1} aria-label="清空搜索">
                  <XIcon aria-hidden="true" />
                </InputClear>
              </InputGroup>
            </div>
            <div className="blogger-tools">
              <AddBlogger onAdded={bloggerAdded} onUnauthorized={login.expire} />
              <SyncHistory
                blogger={selectedBlogger}
                bloggers={bloggers.data}
                onUnauthorized={login.expire}
              />
            </div>
            <div className="bloggers-list">
              <Button
                type="button"
                className="blogger-row all-bloggers"
                aria-pressed={selection.uid === null}
                onClick={() => selectBlogger(null)}
              >
                <span className="blogger-avatar all-avatar" aria-hidden="true">
                  <img src={weiboLogo} alt="" />
                </span>
                <span className="blogger-name">全部博主</span>
              </Button>
              {bloggers.isPending && (
                <p className="panel-feedback" role="status">
                  正在加载博主……
                </p>
              )}
              {bloggers.isError && !isUnauthorized(bloggers.error) && (
                <p className="panel-feedback" role="alert">
                  博主加载失败，请刷新页面重试。（{bloggers.error.message}）
                </p>
              )}
              {bloggers.isSuccess && bloggers.data.length === 0 && (
                <p className="panel-feedback" role="status">
                  暂无博主。
                </p>
              )}
              <BloggerList
                bloggers={bloggers.data ?? []}
                keyword={bloggerSearch}
                selectedUid={selection.uid}
                onSelect={selectBlogger}
              />
            </div>
            {login.expired && (
              <PostLogin
                pending={login.pending}
                started={login.started}
                message={login.message}
                onStart={login.start}
              />
            )}
          </section>
        </aside>
        <section className="feed" aria-label="博文区域">
          <header className="feed-header">
            <div className="feed-summary">
              <h2>{selectedBlogger ? `${selectedBlogger.screenName}的微博` : '全部微博'}</h2>
              <div className="feed-context">
                {date && (
                  <time className="reading-date" dateTime={date}>
                    {date}
                  </time>
                )}
                {posts.data && (
                  <span className="feed-count" aria-label="博文总数">
                    共 {totalCount} 条
                  </span>
                )}
              </div>
            </div>
            <div className="feed-actions">
              <PostSearch
                open={searchOpen}
                onOpenChange={setSearchOpen}
                uid={selection.uid}
                scopeLabel={selectedBlogger ? `@${selectedBlogger.screenName}` : '全部博主'}
                onSelectPost={jumpToPost}
                onUnauthorized={login.expire}
              />
              <Button
                type="button"
                className="window-control toggle"
                aria-label="切换到微博群聊"
                title="切换到微博群聊"
                onClick={() => {
                  window.location.href = '/chat/index.html';
                }}
              >
                <MessageSquareIcon aria-hidden="true" />
                微博群聊
              </Button>
            </div>
          </header>
          <div
            className="posts"
            key={readingKey}
            tabIndex={0}
            aria-label="微博列表"
            onScroll={(event) => loadEarlier(event.currentTarget)}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) scrollIntent.current = true;
            }}
            onWheel={(event) => {
              scrollIntent.current = event.deltaY > 0;
              loadEarlier(event.currentTarget);
            }}
            onTouchMove={() => {
              scrollIntent.current = true;
            }}
            onKeyDown={(event) => {
              scrollIntent.current = ['ArrowDown', 'PageDown', 'End', ' '].includes(event.key);
              if (scrollIntent.current) loadEarlier(event.currentTarget);
            }}
          >
            {posts.isFetching && !posts.isFetchingNextPage && <p role="status">正在加载博文……</p>}
            {posts.isError && !posts.isFetchNextPageError && !isUnauthorized(posts.error) && (
              <>
                <p role="alert">博文加载失败。（{posts.error.message}）</p>
                <Button type="button" className="retry-posts" onClick={() => void posts.refetch()}>
                  重试博文
                </Button>
              </>
            )}
            {posts.data?.pages.map((page, index) => (
              <section
                className="post-day"
                aria-label={`${posts.data.pageParams[index]} 的微博`}
                key={posts.data.pageParams[index]}
              >
                {index > 0 && (
                  <h3 className="post-day-heading">
                    <time dateTime={posts.data.pageParams[index]}>
                      {posts.data.pageParams[index]}
                    </time>
                  </h3>
                )}
                <PostFeed
                  result={page}
                  targetPostId={index === 0 ? jump?.mblogId : undefined}
                  likeEnabled={login.likeEnabled}
                  likeSession={login.likeSession}
                  onUnauthorized={login.expire}
                />
              </section>
            ))}
            {posts.data && (
              <div className="reading-more">
                {posts.isFetchingNextPage && <p role="status">正在加载更早微博……</p>}
                {posts.isFetchNextPageError && !isUnauthorized(posts.error) && (
                  <p role="alert">更早微博加载失败。（{posts.error.message}）</p>
                )}
                {posts.hasNextPage ? (
                  <Button
                    type="button"
                    className="search-open load-earlier"
                    disabled={posts.isFetching}
                    onClick={() => {
                      scrollIntent.current = false;
                      void posts.fetchNextPage({ cancelRefetch: false });
                    }}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                    {posts.isFetchNextPageError ? '重试加载更早微博' : '加载更早微博'}
                  </Button>
                ) : (
                  <p>已读到最早的微博。</p>
                )}
              </div>
            )}
          </div>
        </section>
        <aside className="reading-sidebar" aria-label="日期导航">
          <section className="dates-panel" aria-label="日期区域">
            <header className="dates-heading">
              <h2>日期选择</h2>
              <Button
                type="button"
                className="theme-toggle"
                aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
                title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <SunIcon aria-hidden="true" />
                ) : (
                  <MoonIcon aria-hidden="true" />
                )}
              </Button>
            </header>
            <div className="dates-list">
              {calendar.isFetching && (
                <p className="panel-feedback" role="status">
                  正在加载日期……
                </p>
              )}
              {calendar.isError && !isUnauthorized(calendar.error) && (
                <p className="panel-feedback" role="alert">
                  日期加载失败，请刷新页面重试。（{calendar.error.message}）
                </p>
              )}
              {calendar.isSuccess && !date && (
                <p className="panel-feedback" role="status">
                  暂无有博文的日期。
                </p>
              )}
              {date && (
                <DateCalendar
                  key={selection.visit}
                  months={months}
                  date={date}
                  reveal={jump}
                  onSelectDate={selectDate}
                />
              )}
            </div>
          </section>
        </aside>
      </main>
      <div className="reading-announcement" aria-live="polite" aria-atomic="true">
        {posts.data && !posts.isFetching && loadedCount > 0 ? `已加载 ${loadedCount} 条微博` : ''}
      </div>
    </div>
  );
}
