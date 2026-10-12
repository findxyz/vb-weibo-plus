import { useQuery } from '@tanstack/react-query';

type Blogger = { uid: number; screenName: string };

export default function PostPreview() {
  const bloggers = useQuery({
    queryKey: ['post', 'bloggers'],
    queryFn: async ({ signal }): Promise<Blogger[]> => {
      const response = await fetch('/post/bloggers', { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });

  return (
    <div className="app">
      <header className="titlebar"><h1>本地微博预览</h1></header>
      <main>
        <h2>博主</h2>
        {bloggers.isPending && <p role="status">正在加载博主……</p>}
        {bloggers.isError && <p role="alert">博主加载失败，请刷新页面重试。（{bloggers.error.message}）</p>}
        {bloggers.isSuccess && bloggers.data.length === 0 && <p role="status">暂无博主。</p>}
        <ul aria-label="博主">{bloggers.data?.map((blogger) => (
          <li key={blogger.uid}>{blogger.screenName}</li>
        ))}</ul>
      </main>
    </div>
  );
}
