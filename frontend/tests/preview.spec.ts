import { createServer as createHttpServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let backend: Server;
let vite: ViteDevServer;
let baseUrl: string;
let requests: string[];
let bloggers = [{ uid: 1, screenName: '第一位' }, { uid: 2, screenName: '第二位' }];
let holdResponse = false;
let holdPath = '/post/bloggers';
let releaseResponse: (() => void) | undefined;
let status = 200;
let calendarStatus = 200;
let listStatus = 200;
let calendar = { months: [{ month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] }] };
let posts = { items: [{ mblogId: 'local-1', content: '第一行\n第二行<br>第三行', createdAt: Date.parse('2026-08-05T00:30:00Z'), blogger: { uid: 1, screenName: '第一位' } }], page: 1, size: 9999, total: 3 };
let calendarsByUid: Record<string, typeof calendar>;
let postsByUid: Record<string, typeof posts>;
let holdUid: string | undefined;
let pageErrors: string[];
let writeRequests: string[];

test.beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const url = new URL(request.url!, 'http://fixture');
    const path = url.pathname;
    const uid = url.searchParams.get('uid') ?? url.searchParams.get('uids') ?? 'all';
    if (path === '/post/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      response.end('<h1>后端正式页面</h1>');
      return;
    }
    const responseStatus = path === '/post/calendar' ? calendarStatus : path === '/post/list' ? listStatus : status;
    const payload = JSON.stringify(responseStatus === 200 ? (path === '/post/calendar' ? calendarsByUid[uid] ?? calendar : path === '/post/list' ? postsByUid[uid] ?? posts : bloggers) : responseStatus === 503 ? bloggers : { msg: '本地读取暂时不可用' });
    const send = () => {
      if (releaseResponse === send) releaseResponse = undefined;
      response.writeHead(responseStatus, { 'Content-Type': 'application/json' });
      response.end(payload);
    };
    if (holdResponse && path === holdPath && (!holdUid || uid === holdUid)) releaseResponse = send;
    else send();
  });
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP server address');
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${address.port}`;
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0];
});

test.afterAll(async () => {
  await vite?.close();
  await new Promise<void>((resolve) => backend?.close(() => resolve()));
  delete process.env.API_PROXY_TARGET;
});

test.beforeEach(({ page }) => {
  requests = [];
  bloggers = [{ uid: 1, screenName: '第一位' }, { uid: 2, screenName: '第二位' }];
  holdResponse = false;
  holdPath = '/post/bloggers';
  releaseResponse = undefined;
  calendarsByUid = {};
  postsByUid = {};
  holdUid = undefined;
  status = 200;
  calendarStatus = 200;
  listStatus = 200;
  calendar = { months: [{ month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] }] };
  posts = { items: [{ mblogId: 'local-1', content: '第一行\n第二行<br>第三行', createdAt: Date.parse('2026-08-05T00:30:00Z'), blogger: { uid: 1, screenName: '第一位' } }], page: 1, size: 9999, total: 3 };
  pageErrors = [];
  writeRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writeRequests.push(`${request.method()} ${request.url()}`);
  });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(writeRequests).toEqual([]);
});

test('default_reading_uses_latest_valid_day_shanghai_bounds_and_backend_total', async ({ page }) => {
  calendar.months = [
    { month: '2026-09', count: 0, days: [{ date: '2026-09-31', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] },
  ];
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await expect(page.getByLabel('当前范围')).toHaveText('全部博主');
  await expect(page.getByLabel('当前日期')).toHaveText('2026-08-05');
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
  await expect(page.getByLabel('博文总数')).toHaveCSS('font-size', '12px');
  await expect(page.getByLabel('博文总数')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await expect(page.getByRole('article')).toContainText('2026-08-05 08:30');
  await expect(page.locator('.post-content')).toHaveCSS('white-space', 'pre-wrap');
  const query = new URL(requests.find(value => value.startsWith('GET /post/list'))!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: '1', size: '9999', start: '2026-08-05 00:00:00', end: '2026-08-05 23:59:59' });
});

test('date_navigation_groups_years_and_months_and_reads_the_clicked_day', async ({ page }, testInfo) => {
  calendar.months = [
    { month: '2025-12', count: 1, days: [{ date: '2025-12-31', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2026-08', count: 3, days: [{ date: '2026-08-04', count: 1 }, { date: '2026-08-05', count: 2 }] },
  ];
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await expect(page.getByRole('button', { name: '2026 年，4 条', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '2026-08，3 条', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '2025 年，1 条', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const beforeToggle = requests.slice();
  await page.getByRole('button', { name: '2025 年，1 条', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '2025-12，1 条', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '2025-12-31', exact: true })).toBeVisible();
  expect(requests).toEqual(beforeToggle);
  posts.items[0].content = '较早日期正文';
  await page.getByRole('button', { name: '2025-12-31', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('较早日期正文');
  await expect(page.getByLabel('当前日期')).toHaveText('2025-12-31');
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const query = new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: '1', size: '9999', start: '2025-12-31 00:00:00', end: '2025-12-31 23:59:59' });
  await page.screenshot({ path: testInfo.outputPath('date-navigation.png') });
});

test('blogger_selection_resets_to_latest_day_and_returning_to_all_reloads_its_scope', async ({ page }) => {
  calendarsByUid['1'] = { months: [{ month: '2026-07', count: 2, days: [{ date: '2026-07-10', count: 1 }, { date: '2026-07-09', count: 1 }] }] };
  postsByUid['1'] = { ...posts, items: [{ ...posts.items[0], content: '单博主正文' }], total: 1 };
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('当前范围')).toHaveText('第一位');
  await expect(page.getByRole('heading', { name: '第一位的微博', exact: true })).toBeVisible();
  await expect(page.getByLabel('当前日期')).toHaveText('2026-07-10');
  await expect(page.getByRole('article')).toContainText('单博主正文');
  await expect(page.getByRole('button', { name: '第一位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const singleQuery = new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(singleQuery)).toEqual({ page: '1', size: '9999', start: '2026-07-10 00:00:00', end: '2026-07-10 23:59:59', uids: '1' });
  expect(requests).toContain('GET /post/calendar?uid=1');
  await page.getByRole('button', { name: '2026-07-09', exact: true }).click();
  await expect(page.getByLabel('当前日期')).toHaveText('2026-07-09');
  await expect(page.getByRole('article')).toBeVisible();
  const beforeRepeat = requests.length;
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.getByLabel('当前日期')).toHaveText('2026-07-10');
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.slice(beforeRepeat).map(value => value.split('?')[0])).toEqual(['GET /post/calendar', 'GET /post/list']);
  await page.getByRole('button', { name: '全部博主', exact: true }).click();
  await expect(page.getByLabel('当前范围')).toHaveText('全部博主');
  await expect(page.getByLabel('当前日期')).toHaveText('2026-08-05');
  await expect(page.getByRole('article')).toContainText('第一行');
  expect(new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams.has('uids')).toBe(false);
  expect(requests.filter(value => value.startsWith('GET /post/bloggers'))).toHaveLength(1);
});

test('dev_formal_link_opens_the_configured_backend_page', async ({ page }) => {
  await page.goto(`${baseUrl}preview/post/index.html`);
  const destination = `${process.env.API_PROXY_TARGET}/post/index.html`;
  await expect(page.getByRole('link', { name: '正式 post 页面' })).toHaveAttribute('href', destination);
  await page.getByRole('link', { name: '正式 post 页面' }).click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('heading', { name: '后端正式页面' })).toBeVisible();
});

test('zero_count_day_does_not_replace_latest_day_with_captured_content', async ({ page }) => {
  calendar.months.unshift({ month: '2060-01', count: 0, days: [{ date: '2060-01-01', count: 0 }] });
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByLabel('当前日期')).toHaveText('2026-08-05');
});

test('rich_text_removes_executable_content_and_preserves_links_and_line_breaks', async ({ page }) => {
  posts.items[0].content = '<script>window.attack=1</script><svg onload="window.attack=2"></svg><a href="javascript:window.attack=3">危险链接</a><iframe srcdoc="<script>parent.attack=4</script>"></iframe><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="window.attack=5"><b>正常正文</b>\n第二行<br>第三行 https://example.com/A_(B). //@测试用户: 文本 <a href="/n/现有用户">现有用户</a> <a href="//weibo.com/u/1">主页</a>';
  await page.goto(`${baseUrl}preview/post/index.html`);
  const content = page.locator('.post-content');
  await expect(content).toContainText('正常正文');
  await expect(content.locator('script, svg, iframe, [onload], [onerror], [onclick], a[href^="javascript:"]')).toHaveCount(0);
  await content.locator('img').evaluate(element => element.dispatchEvent(new Event('error')));
  expect(await page.evaluate(() => (window as Window & { attack?: number }).attack)).toBeUndefined();
  await expect(content.getByRole('link', { name: 'https://example.com/A_(B)' })).toHaveAttribute('href', 'https://example.com/A_(B)');
  await expect(content.getByRole('link', { name: '@测试用户' })).toHaveAttribute('href', 'https://weibo.com/n/测试用户');
  await expect(content.getByRole('link', { name: '现有用户' })).toHaveAttribute('href', 'https://weibo.com/n/现有用户');
  await expect(content.getByRole('link', { name: '主页' })).toHaveAttribute('href', 'https://weibo.com/u/1');
  for (const link of await content.locator('a').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  }
  await expect(content).toHaveCSS('white-space', 'pre-wrap');
  await expect(content.locator('br')).toHaveCount(1);
});

test('sanitizer_failure_renders_escaped_text_without_reinterpreting_markup', async ({ page }) => {
  posts.items[0].content = 'fallback-marker &lt;img src=x onerror="window.attack=1"&gt;<b>安全降级</b>';
  await page.addInitScript(() => {
    DOMParser.prototype.parseFromString = function() { throw new Error('Sanitizer unavailable'); };
  });
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.post-content')).toHaveText(posts.items[0].content);
  await expect(page.locator('.post-content img, .post-content b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { attack?: number }).attack)).toBeUndefined();
});

test('calendar_empty_and_day_empty_are_distinct_reading_states', async ({ page }) => {
  calendar = { months: [] };
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('status')).toHaveText('暂无有博文的日期。');
  expect(requests).toEqual(['GET /post/bloggers', 'GET /post/calendar']);
  calendar = { months: [{ month: '2026-08', count: 1, days: [{ date: '2026-08-05', count: 1 }] }] };
  posts.items = [];
  posts.total = 0;
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('该日无微博。');
  await expect(page.getByLabel('当前日期')).toHaveText('2026-08-05');
  await expect(page.getByLabel('博文总数')).toHaveText('共 0 条');
});

test('calendar_error_retains_loaded_bloggers_and_backend_message', async ({ page }) => {
  calendarStatus = 500;
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('日期加载失败，请刷新页面重试。（本地读取暂时不可用）');
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  expect(requests).toEqual(['GET /post/bloggers', 'GET /post/calendar']);
});

test('list_retry_only_recovers_list_and_keeps_blogger_and_date_regions', async ({ page }) => {
  listStatus = 500;
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('博文加载失败。（本地读取暂时不可用）');
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await expect(page.getByLabel('当前日期')).toHaveText('2026-08-05');
  const initial = requests.slice();
  listStatus = 200;
  await page.getByRole('button', { name: '重试博文' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article')).toContainText('第一行');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests.slice(initial.length)).toEqual([initial.at(-1)]);
});

test('unloaded_reading_discards_old_list_response_without_polling', async ({ page }) => {
  await page.clock.install();
  holdResponse = true;
  holdPath = '/post/list';
  posts.items[0].content = '旧请求正文';
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('status')).toHaveText('正在加载博文……');
  await page.goto(`${baseUrl}preview/chat/index.html`);
  releaseResponse?.();
  holdResponse = false;
  posts.items[0].content = '新请求正文';
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('article')).toContainText('新请求正文');
  await expect(page.getByRole('article')).not.toContainText('旧请求正文');
  const completed = requests.slice();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
  await page.clock.runFor(65000);
  await expect(page.getByRole('article')).toContainText('新请求正文');
  expect(requests).toEqual(completed);
});

test('component_unmount_aborts_its_inflight_http_query_and_remount_loads_fresh_data', async ({ page }) => {
  const component = new URL('../src/post/PostPreview.tsx', import.meta.url);
  const original = await readFile(component, 'utf8');
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).startsWith('/post/list?')) {
        init?.signal?.addEventListener('abort', () => Object.assign(window, { readingAborted: true }));
      }
      return originalFetch(input, init);
    };
  });
  holdResponse = true;
  holdPath = '/post/list';
  posts.items[0].content = '过期正文';
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('status')).toHaveText('正在加载博文……');
  try {
    await writeFile(component, "export default function PostPreview() { return <h1>阅读已退出</h1>; }");
    await expect(page.getByRole('heading', { name: '阅读已退出' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { readingAborted?: boolean }).readingAborted)).toBe(true);
    await page.waitForLoadState('networkidle');
    releaseResponse?.();
    holdResponse = false;
    posts.items[0].content = '恢复后的正文';
  } finally {
    holdResponse = false;
    await writeFile(component, original);
    releaseResponse?.();
  }
  await expect(page.getByRole('article')).toContainText('恢复后的正文');
  await expect(page.getByRole('article')).not.toContainText('过期正文');
});

test('post_announces_loading_before_names_arrive', async ({ page }) => {
  holdResponse = true;
  await page.goto(`${baseUrl}preview/post/index.html`);
  try {
    await expect(page.getByRole('status')).toHaveText('正在加载博主……');
  } finally {
    releaseResponse?.();
  }
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('post_displays_names_from_proxied_query', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
  await page.screenshot({ path: testInfo.outputPath('post.png') });
});

test('post_explains_empty_blogger_list', async ({ page }) => {
  bloggers = [];
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('status')).toHaveText('暂无博主。');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(requests).toEqual(['GET /post/bloggers']);
});

test('post_announces_query_failure', async ({ page }) => {
  status = 503;
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('博主加载失败，请刷新页面重试。（HTTP 503）');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(requests).toEqual(['GET /post/bloggers']);
});

test('chat_entry_refreshes_with_its_own_skin_without_business_requests', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}preview/chat/index.html`);
  await expect(page.getByRole('heading', { name: '微博群聊预览' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(185, 216, 242)');
  await page.reload();
  await expect(page.getByRole('heading', { name: '微博群聊预览' })).toBeVisible();
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('chat.png') });
});

test('post_entry_refreshes_with_paper_skin', async ({ page }) => {
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(43, 38, 32)');
  await expect(page.locator('body')).toHaveCSS('background-image', /radial-gradient/);
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list', 'GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
});

test('dev_proxy_preserves_html_modules_css_and_exact_api_paths', async ({ request }) => {
  for (const [path, mime] of [
    ['preview/post/index.html', 'text/html'],
    ['preview/chat/index.html', 'text/html'],
    ['src/post/main.tsx', 'javascript'],
    ['src/chat/main.tsx', 'javascript'],
    ['src/post/post.css?direct', 'text/css'],
    ['src/chat/chat.css?direct', 'text/css'],
  ]) {
    const response = await request.get(`${baseUrl}${path}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(mime);
  }
  for (const path of ['post/index.html', 'post/bloggers.js', 'chat/index.html']) {
    expect((await request.get(`${baseUrl}${path}`)).status()).toBe(404);
  }
  const response = await request.get(`${baseUrl}post/bloggers?probe=1`);
  expect(await response.json()).toEqual(bloggers);
  expect(requests).toEqual(['GET /post/bloggers?probe=1']);
});

test('component_and_css_hot_updates_preserve_the_open_document', async ({ page }) => {
  const component = new URL('../src/post/PostPreview.tsx', import.meta.url);
  const stylesheet = new URL('../src/post/post.css', import.meta.url);
  const originalComponent = await readFile(component, 'utf8');
  const originalStylesheet = await readFile(stylesheet, 'utf8');
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  await page.evaluate(() => Object.assign(window, { previewDocument: 'original' }));
  try {
    await writeFile(component, originalComponent.replace('本地微博预览', '本地微博热更新验证'));
    await expect(page.getByRole('heading', { name: '本地微博热更新验证' })).toBeVisible();
    await writeFile(stylesheet, originalStylesheet.replace('font-size: 22px', 'font-size: 19px'));
    await expect(page.getByRole('heading', { name: '本地微博热更新验证' })).toHaveCSS('font-size', '19px');
    expect(await page.evaluate(() => (window as Window & { previewDocument?: string }).previewDocument)).toBe('original');
  } finally {
    await writeFile(component, originalComponent);
    await writeFile(stylesheet, originalStylesheet);
  }
  await expect(page.getByRole('heading', { name: '本地微博预览' })).toBeVisible();
});
