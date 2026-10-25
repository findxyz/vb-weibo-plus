import { createServer as createHttpServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect, chromium, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Blogger, PostImage, PostList, Video } from '../src/post/queries';

const approvedGeometry = JSON.parse(await readFile(new URL('./fixtures/post-geometry.json', import.meta.url), 'utf8'));

let backend: Server;

test('formal_post_entry_refreshes_without_preview_and_retires_preview_document', async ({ page }) => {
  const response = await page.goto(`${baseUrl}post/index.html`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('本地微博');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
  expect(await page.evaluate(async () => {
    const image = new Image();
    image.src = (document.querySelector('link[rel="icon"]') as HTMLLinkElement).href;
    await image.decode();
    return image.naturalWidth;
  })).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '博主管理', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '正式 post 页面' })).toHaveCount(0);
  await expect(page.getByRole('article')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article')).toBeVisible();
  expect((await page.request.get(`${baseUrl}preview/post/index.html`)).status()).toBe(404);
});
let vite: ViteDevServer;
let baseUrl: string;
let requests: string[];
let bloggers: Blogger[] = [{ uid: 1, screenName: '第一位' }, { uid: 2, screenName: '第二位' }];
let holdResponse = false;
let holdPath = '/post/bloggers';
let releaseResponse: (() => void) | undefined;
let status = 200;
let calendarStatus = 200;
let listStatus = 200;
let calendar = { months: [{ month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] }] };
let posts: PostList = { items: [{ mblogId: 'local-1', content: '第一行\n第二行<br>第三行', createdAt: Date.parse('2026-08-05T00:30:00Z'), blogger: { uid: 1, screenName: '第一位' } }], page: 1, size: 9999, total: 3 };
let calendarsByUid: Record<string, typeof calendar>;
let postsByUid: Record<string, typeof posts>;
let postsByDate: Record<string, typeof posts>;
let holdUid: string | undefined;
let pageErrors: string[];
let writeRequests: string[];
let holdOriginalPid: string | undefined;
let releaseOriginal: (() => void) | undefined;
let searchPosts: PostList;
let searchStatus = 200;
let holdSearch = false;
let releaseSearch: (() => void) | undefined;
let loginPayload: unknown;
let loginStatus = 200;

test('calendar_grid_navigates_months_without_querying_and_only_reads_days_with_posts', async ({ page }) => {
  calendar = { months: [
    { month: '2026-10', count: 3, days: [{ date: '2026-10-18', count: 3 }] },
    { month: '2024-02', count: 1, days: [{ date: '2024-02-29', count: 1 }] },
  ] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('button', { name: '2026-10-18', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const reads = requests.filter(value => value.startsWith('GET /post/'));
  await expect(page.getByRole('button', { name: '2026-10-01', exact: true })).toBeDisabled();
  const firstDay = page.getByRole('button', { name: '2026-10-01', exact: true });
  expect(await firstDay.evaluate(element => [...element.parentElement!.children].indexOf(element))).toBe(3);
  await page.getByLabel('选择年份', { exact: true }).selectOption('2024');
  await page.getByLabel('选择月份', { exact: true }).selectOption('02');
  await expect(page.getByRole('button', { name: '2024-02-29', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '2024-02-30', exact: true })).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/'))).toEqual(reads);
  await page.getByRole('button', { name: '2024-02-29', exact: true }).click();
  await expect.poll(() => requests.some(value => value.includes('start=2024-02-29'))).toBe(true);
  await expect(page.getByRole('button', { name: '2024-02-29', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.getByLabel('选择月份', { exact: true })).toHaveValue('03');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.getByLabel('选择年份', { exact: true })).toHaveValue('2026');
  await expect(page.getByLabel('选择月份', { exact: true })).toHaveValue('10');
});

function imageFixture(pid: string, overrides: Partial<PostImage> = {}): PostImage {
  return { pid, thumbnailWidth: 300, thumbnailHeight: 180, originalWidth: 1200, originalHeight: 720,
    thumbnailUrl: `/post/image?mblogId=local-1&pid=${pid}&variant=thumbnail`,
    originalUrl: `/post/image?mblogId=local-1&pid=${pid}&variant=original`, ...overrides };
}


test.beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const url = new URL(request.url!, 'http://fixture');
    const path = url.pathname;
    if (path === '/chat/groups') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('[]');
      return;
    }
    if (path === '/weibo/login/status') {
      response.writeHead(loginStatus, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(loginPayload));
      return;
    }
    if (path === '/post/list' && url.searchParams.has('keyword')) {
      const payload = JSON.stringify(searchStatus === 200 ? searchPosts : { msg: '本地搜索暂时不可用' });
      const send = () => {
        response.writeHead(searchStatus, { 'Content-Type': 'application/json' });
        response.end(payload);
      };
      if (holdSearch) releaseSearch = send;
      else send();
      return;
    }
    if (path === '/chat/image') {
      const imagePath = new URL(url.searchParams.get('url')!).pathname;
      const broken = imagePath.endsWith('/broken.svg');
      response.writeHead(broken ? 404 : 200, { 'Content-Type': broken ? 'text/plain' : 'image/svg+xml' });
      const size = imagePath.startsWith('/large/') ? 300 : 48;
      response.end(broken ? 'Missing image' : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="red"/></svg>`);
      return;
    }
    if (path === '/post/video-cover') {
      const broken = url.searchParams.get('mblogId') === 'broken-video';
      response.writeHead(broken ? 404 : 200, { 'Content-Type': broken ? 'text/plain' : 'image/svg+xml' });
      response.end(broken ? 'Missing cover' : '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#f9d27c"/></svg>');
      return;
    }
    if (path === '/post/image') {
      const pid = url.searchParams.get('pid');
      const original = url.searchParams.get('variant') === 'original';
      const broken = pid === 'broken' || (pid === 'broken-original' && original);
      const send = () => {
        if (releaseOriginal === send) releaseOriginal = undefined;
        response.writeHead(broken ? 404 : 200, { 'Content-Type': broken ? 'text/plain' : 'image/svg+xml' });
        response.end(broken ? 'Missing image' : '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#f9d27c"/></svg>');
      };
      if (original && pid === holdOriginalPid) releaseOriginal = send;
      else send();
      return;
    }
    const uid = url.searchParams.get('uid') ?? url.searchParams.get('uids') ?? 'all';
    if (path === '/post/index.html' || path === '/chat/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      response.end(path === '/chat/index.html' ? '<h1>后端群聊页面</h1>' : '<h1>后端正式页面</h1>');
      return;
    }
    const responseStatus = path === '/post/calendar' ? calendarStatus : path === '/post/list' ? listStatus : status;
    const payload = JSON.stringify(responseStatus === 200 ? (path === '/post/calendar' ? calendarsByUid[uid] ?? calendar : path === '/post/list' ? postsByDate[url.searchParams.get('start')?.slice(0, 10) ?? ''] ?? postsByUid[uid] ?? posts : bloggers) : responseStatus === 503 ? bloggers : { msg: '本地读取暂时不可用' });
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
  postsByDate = {};
  holdUid = undefined;
  status = 200;
  calendarStatus = 200;
  listStatus = 200;
  calendar = { months: [{ month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] }] };
  posts = { items: [{ mblogId: 'local-1', content: '第一行\n第二行<br>第三行', createdAt: Date.parse('2026-08-05T00:30:00Z'), blogger: { uid: 1, screenName: '第一位' } }], page: 1, size: 9999, total: 3 };
  pageErrors = [];
  writeRequests = [];
  holdOriginalPid = undefined;
  releaseOriginal = undefined;
  searchPosts = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'search-1', contentRaw: '检索命中关键词' }] };
  searchStatus = 200;
  holdSearch = false;
  releaseSearch = undefined;
  loginPayload = { valid: true };
  loginStatus = 200;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writeRequests.push(`${request.method()} ${request.url()}`);
  });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(writeRequests).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  test(`post_starry_layout_keeps_bloggers_left_and_calendar_right_at_${viewport.width}`, async ({ page }, testInfo) => {

    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    await expect(page.locator('.brand-slogan, .titlebar')).toHaveCount(0);
    const feed = (await page.locator('.feed').boundingBox())!;
    const bloggersSidebar = (await page.locator('.bloggers-sidebar').boundingBox())!;
    const datesSidebar = (await page.locator('.reading-sidebar').boundingBox())!;
    const calendar = (await page.locator('.dates-panel').boundingBox())!;
    const bloggers = (await page.locator('.bloggers-panel').boundingBox())!;
    expect(bloggersSidebar.x + bloggersSidebar.width).toBeLessThanOrEqual(feed.x);
    expect(datesSidebar.x).toBeGreaterThan(feed.x + feed.width - 1);
    expect(calendar.y).toBe(feed.y);
    expect(bloggers.y).toBe(feed.y);
    expect(feed.y).toBeGreaterThan(0);
    expect(feed.y).toBeLessThan(96);
    const search = (await page.locator('.feed-actions > .search-open').boundingBox())!;
    const chat = (await page.getByRole('button', { name: '切换到微博群聊', exact: true }).boundingBox())!;
    expect(chat.x).toBeGreaterThan(search.x + search.width - 1);
    expect(chat.y).toBe(search.y);
    expect(chat.x + chat.width).toBeGreaterThan(feed.x + feed.width - 40);
    const app = (await page.locator('.app').boundingBox())!;
    expect(app.width).toBe(1120);
    expect(app.x).toBe((viewport.width - 1120) / 2);
    await expect(page.locator('.post-card')).toHaveCSS('border-radius', '0px');
    await expect(page.locator('.post-card')).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.post-content')).toHaveCSS('font-size', '15px');
    await expect(page.locator('.post-content')).toHaveCSS('line-height', '24px');
    await page.screenshot({ path: testInfo.outputPath('starry-reading.png') });
  });
}

function prepareContinuousReading() {
  calendar = { months: [
    { month: '2026-08', count: 9, days: [{ date: '2026-08-05', count: 8 }, { date: '2026-08-03', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-31', count: 1 }] },
  ] };
  posts = { ...posts, total: 8, items: Array.from({ length: 8 }, (_, index) => ({ ...posts.items[0], mblogId: `latest-${index}`, content: `当天微博 ${index}\n${'阅读正文\n'.repeat(8)}` })) };
  postsByDate['2026-08-03'] = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'earlier', content: '前一个有微博日期的正文', createdAt: Date.parse('2026-08-03T00:30:00Z') }] };
  postsByDate['2026-07-31'] = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'oldest', content: '跨月最早正文', createdAt: Date.parse('2026-07-31T00:30:00Z') }] };
}

async function scrollReadingToBottom(page: Page) {
  await page.locator('.posts').hover();
  await page.mouse.wheel(0, 100000);
}

test('continuous_reading_appends_previous_available_day_without_replacing_reading_or_prefetching', async ({ page }, testInfo) => {
  prepareContinuousReading();
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(8);
  expect(requests.filter(value => value.startsWith('GET /post/list?'))).toHaveLength(1);
  await page.getByRole('article').first().evaluate(element => element.setAttribute('data-retained', 'true'));
  await scrollReadingToBottom(page);
  await expect(page.getByRole('article')).toHaveCount(9);
  await expect(page.getByRole('article').first()).toHaveAttribute('data-retained', 'true');
  await expect(page.getByRole('article').last()).toContainText('前一个有微博日期的正文');
  await expect(page.getByRole('heading', { name: '2026-08-03', exact: true })).toBeVisible();
  expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.reading-date')).toHaveText('2026-08-05');
  await expect(page.getByLabel('博文总数')).toHaveText('共 9 条');
  const query = new URL(requests.filter(value => value.startsWith('GET /post/list?')).at(-1)!.slice(4), 'http://fixture');
  expect(Object.fromEntries(query.searchParams)).toEqual({ page: '1', size: '9999', start: '2026-08-03 00:00:00', end: '2026-08-03 23:59:59' });
  await scrollReadingToBottom(page);
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByRole('article').last()).toContainText('跨月最早正文');
  await expect(page.getByText('已读到最早的微博。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '加载更早微博', exact: true })).toHaveCount(0);
  const reads = [...requests];
  await scrollReadingToBottom(page);
  expect(requests).toEqual(reads);
  await page.screenshot({ path: testInfo.outputPath('continuous-reading.png') });
});

test('continuous_reading_serializes_scroll_requests_and_keeps_loaded_cards_visible', async ({ page }) => {
  prepareContinuousReading();
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(8);
  holdResponse = true; holdPath = '/post/list';
  await scrollReadingToBottom(page);
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  let position = 0;
  try {
    for (let index = 0; index < 3; index++) await page.mouse.wheel(0, 100000);
    await expect(page.getByRole('article')).toHaveCount(8);
    await expect(page.getByRole('status')).toHaveText('正在加载更早微博……');
    expect(requests.filter(value => value.startsWith('GET /post/list?'))).toHaveLength(2);
    position = await page.locator('.posts').evaluate(element => element.scrollTop);
  } finally { holdResponse = false; releaseResponse?.(); }
  await expect(page.getByRole('article')).toHaveCount(9);
  expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBe(position);
  expect(requests.filter(value => value.startsWith('GET /post/list?'))).toHaveLength(2);
});

for (const input of ['keyboard', 'scrollbar']) {
  test(`continuous_reading_loads_after_scrolling_with_${input}`, async ({ page: defaultPage }) => {
    const nativeBrowser = input === 'scrollbar' ? await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL, ignoreDefaultArgs: ['--hide-scrollbars'] }) : undefined;
    const page = nativeBrowser ? await nativeBrowser.newPage({ viewport: { width: 1280, height: 800 } }) : defaultPage;
    if (nativeBrowser) page.on('pageerror', error => pageErrors.push(error.message));
    try {
      prepareContinuousReading();
      await page.goto(`${baseUrl}post/index.html`);
      await expect(page.getByRole('article')).toHaveCount(8);
      const feed = page.locator('.posts');
      if (input === 'keyboard') { await feed.focus(); await page.keyboard.press('End'); }
      else {
        const bounds = (await feed.boundingBox())!;
        const scrollbarWidth = bounds.width - await feed.evaluate(element => element.clientWidth);
        await page.mouse.move(bounds.x + bounds.width - scrollbarWidth / 2, bounds.y + 40);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width - scrollbarWidth / 2, bounds.y + bounds.height - 20, { steps: 10 });
        await page.mouse.up();
        expect(await feed.evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
      }
      await expect(page.getByRole('article')).toHaveCount(9);
    } finally { await nativeBrowser?.close(); }
  });
}

test('continuous_reading_expired_login_preserves_loaded_content_and_allows_recovery', async ({ page }) => {
  prepareContinuousReading();
  await page.route('**/weibo/login/qr', async route => { listStatus = 200; await route.fulfill({ json: {} }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(8);
  listStatus = 401;
  await scrollReadingToBottom(page);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect(page.locator('.login-expired')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '加载更早微博', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '加载更早微博', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(9);
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('continuous_reading_retains_content_on_failure_and_requires_explicit_retry', async ({ page }) => {
  prepareContinuousReading();
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(8);
  listStatus = 500;
  await scrollReadingToBottom(page);
  await expect(page.getByRole('alert')).toContainText('更早微博加载失败');
  await expect(page.getByRole('article')).toHaveCount(8);
  const reads = [...requests];
  await scrollReadingToBottom(page);
  expect(requests).toEqual(reads);
  listStatus = 200;
  await page.getByRole('button', { name: '重试加载更早微博', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(9);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/list?'))).toHaveLength(3);
});

for (const navigation of ['blogger', 'date']) {
  test(`continuous_reading_${navigation}_navigation_cancels_pending_append_and_discards_late_response`, async ({ page }) => {
    prepareContinuousReading();
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = (input, init) => {
        if (String(input).includes('start=2026-08-03')) init?.signal?.addEventListener('abort', () => Object.assign(window, { earlierAborted: true }));
        return original(input, init);
      };
    });
    calendarsByUid['2'] = { months: [{ month: '2026-06', count: 1, days: [{ date: '2026-06-01', count: 1 }] }] };
    postsByUid['2'] = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'new-scope', content: '新博主正文' }] };
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.getByRole('article')).toHaveCount(8);
    holdResponse = true; holdPath = '/post/list';
    await scrollReadingToBottom(page);
    await expect.poll(() => Boolean(releaseResponse)).toBe(true);
    const releaseOld = releaseResponse!;
    holdResponse = false;
    await page.getByRole('button', { name: navigation === 'blogger' ? '第二位' : '2026-08-05', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as Window & { earlierAborted?: boolean }).earlierAborted))).toBe(true);
    releaseOld();
    await expect(page.getByRole('article')).toHaveCount(navigation === 'blogger' ? 1 : 8);
    await expect(page.getByText('前一个有微博日期的正文', { exact: true })).toHaveCount(0);
    expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBe(0);
    if (navigation === 'blogger') {
      await expect(page.getByRole('article')).toContainText('新博主正文');
      await page.getByRole('button', { name: '全部博主', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(8);
    }
  });
}

test('continuous_reading_short_days_support_wheel_keyboard_and_empty_day_continuation_in_scope', async ({ page }) => {
  prepareContinuousReading();
  posts = { ...posts, total: 1, items: [posts.items[0]] };
  posts.items[0].content = '当天短微博';
  postsByDate['2026-08-03'] = { ...posts, total: 0, items: [] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第一位的微博');
  await expect(page.getByRole('article')).toHaveCount(1);
  await scrollReadingToBottom(page);
  await expect(page.getByRole('heading', { name: '2026-08-03', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '加载更早微博', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article')).toHaveCount(2);
  const queries = requests.filter(value => value.startsWith('GET /post/list?')).slice(-2);
  expect(queries.every(value => value.includes('uids=1'))).toBe(true);
  await expect(page.getByText('已读到最早的微博。', { exact: true })).toBeVisible();
});

test('continuous_reading_search_restarts_at_target_without_programmatic_scroll_appending_days', async ({ page }) => {
  prepareContinuousReading();
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(8);
  await scrollReadingToBottom(page);
  await expect(page.getByRole('article')).toHaveCount(9);
  searchPosts = { ...postsByDate['2026-08-03'], items: [{ ...postsByDate['2026-08-03'].items[0], createdAt: Date.parse('2026-08-03T00:30:00Z'), contentRaw: '定位前一个日期' }] };
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('定位');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.search-result').click();
  await expect(page.locator('.post-card.flash-highlight')).toContainText('前一个有微博日期的正文');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.locator('.reading-date')).toHaveText('2026-08-03');
  expect(requests.filter(value => value.startsWith('GET /post/list?') && !value.includes('keyword='))).toHaveLength(3);
  await scrollReadingToBottom(page);
  await expect(page.getByRole('article')).toHaveCount(2);
});

test('acceptance_chat_control_opens_formal_chat_with_mouse_and_keyboard', async ({ page }, testInfo) => {

  const destination = `${baseUrl}chat/index.html`;
  for (const action of ['click', 'Enter', 'Space']) {
    await page.goto(`${baseUrl}post/index.html`);
    const control = page.getByRole('button', { name: '切换到微博群聊', exact: true });
    await expect(control).toBeVisible();
    if (action === 'click') await control.click();
    else { await control.focus(); await control.press(action); }
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole('heading', { name: '微博群聊', exact: true })).toBeVisible();
  }
});

test('acceptance_reading_announces_loaded_items_without_making_the_feed_live', async ({ page }) => {
  await page.clock.install();
  posts = { ...posts, total: 9, items: [posts.items[0], { ...posts.items[0], mblogId: 'second-item' }] };
  holdResponse = true; holdPath = '/post/list';
  await page.goto(`${baseUrl}post/index.html`);
  const announcement = page.locator('.reading-announcement');
  await expect(announcement).toHaveAttribute('aria-live', 'polite');
  await expect(announcement).toHaveAttribute('aria-atomic', 'true');
  await expect(announcement).toBeEmpty();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  holdResponse = false; releaseResponse!();
  await expect(announcement).toHaveText('已加载 2 条微博');
  await expect(page.locator('.posts')).not.toHaveAttribute('aria-live', /.+/);
  holdResponse = true;
  await page.getByRole('button', { name: '2026-08-05', exact: true }).click();
  await expect(announcement).toBeEmpty();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  holdResponse = false; releaseResponse!();
  await expect(announcement).toHaveText('已加载 2 条微博');
  const reads = [...requests];
  await page.clock.runFor(3000);
  expect(requests).toEqual(reads);
  listStatus = 500;
  await page.getByRole('button', { name: '2026-08-05', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('博文加载失败');
  await expect(announcement).toBeEmpty();
});

for (const viewport of [{ width: 900, height: 560 }, { width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  test(`acceptance_combined_post_workflow_at_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    calendarsByUid['2'] = { months: [
      { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
      { month: '2026-06', count: 1, days: [{ date: '2026-06-30', count: 1 }] },
    ] };
    const target = { ...posts.items[0], mblogId: 'acceptance-target', blogger: bloggers[1], createdAt: Date.parse('2026-06-29T18:00:00Z'),
      content: '目标完整正文<br>安全链接 https://example.com/local.', contentRaw: '安全 <b>命中</b>',
      pics: [imageFixture('flow-1'), imageFixture('flow-2'), imageFixture('flow-3')],
      retweeted: { screenName: '原作者', content: '转发正文', video: { pageUrl: 'https://video.example.test/flow', coverUrl: '/post/video-cover?mblogId=flow' } } };
    searchPosts = { ...posts, total: 1, items: [target] };
    postsByUid['2'] = { ...posts, total: 1, items: [{ ...posts.items[0], content: '第二位七月正文', blogger: bloggers[1] }] };
    postsByDate['2026-06-30'] = { ...posts, total: 1, items: [target] };
    const added = { uid: 1234, screenName: '新增博主', verified: true };
    calendarsByUid['1234'] = { months: [{ month: '2026-05', count: 1, days: [{ date: '2026-05-12', count: 1 }] }] };
    postsByUid['1234'] = { ...posts, total: 1, items: [{ ...posts.items[0], blogger: added, content: '新增博主本地正文', createdAt: Date.parse('2026-05-12T00:00:00Z') }] };
    const mutationParams: [string, Record<string, string>][] = [];
    await page.route('**/weibo/login/qr', route => { searchStatus = 200; return route.fulfill({ json: {} }); });
    await page.route('**/post/bloggers?uid=*', route => {
      mutationParams.push(['add', Object.fromEntries(new URL(route.request().url()).searchParams)]);
      bloggers = [...bloggers, added]; return route.fulfill({ json: added });
    });
    await page.route('**/post/range?*', route => {
      mutationParams.push(['range', Object.fromEntries(new URL(route.request().url()).searchParams)]);
      calendarsByUid['1234'].months.unshift({ month: '2026-06', count: 1, days: [{ date: '2026-06-01', count: 1 }] });
      return route.fulfill({ status: 204 });
    });
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    await page.getByRole('searchbox', { name: '搜索博主' }).fill('第二');
    await page.getByRole('button', { name: '第二位', exact: true }).click();
    await expect(page.locator('.post-content')).toHaveText('第二位七月正文');
    searchStatus = 401;
    await page.getByRole('button', { name: '高级搜索', exact: true }).click();
    await page.getByLabel('关键词', { exact: true }).fill('命中');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '扫码登录', exact: true }).click();
    await expect(page.locator('.login-expired')).toHaveCount(0);
    await page.getByRole('button', { name: '高级搜索', exact: true }).click();
    await page.getByLabel('关键词', { exact: true }).fill('命中');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator('.search-result-snippet')).toHaveText('安全 <b>命中</b>');
    await page.locator('.search-result').press('Enter');
    await expect(page.getByRole('button', { name: '2026-06-30', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.post-content')).toContainText('目标完整正文');
    await expect(page.locator('.post-retweet-content')).toHaveText('转发正文');
    const picture = page.locator('.post-pic').nth(1);
    await picture.click();
    const viewer = page.getByRole('dialog', { name: '查看原图' });
    await expect(viewer.locator('.viewer-counter')).toHaveText('2 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.viewer-counter')).toHaveText('3 / 3');
    await page.keyboard.press('Escape');
    await expect(picture).toBeFocused();
    await expect(page.getByRole('searchbox', { name: '搜索博主' })).toHaveValue('第二');
    await page.screenshot({ path: testInfo.outputPath('combined-media.png') });
    await writeFile(testInfo.outputPath('media-bounds.json'), JSON.stringify(await page.locator('.posts, .post-card, .post-body, .post-pics, .post-pic, .post-retweet, .post-video, .post-video img').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { className: element.className, width: bounds.width, right: bounds.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, columns: getComputedStyle(element).gridTemplateColumns };
    })), null, 2));
    expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '添加博主', exact: true }).click();
    await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('https://weibo.com/u/1234');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.locator('.feed-header h2')).toHaveText('新增博主的微博');
    await expect(page.locator('.post-content')).toHaveText('新增博主本地正文');
    const dayReads = requests.filter(value => value.startsWith('GET /post/list?') && !value.includes('keyword='));
    await page.getByRole('button', { name: '同步历史', exact: true }).click();
    await page.getByLabel('开始日期', { exact: true }).fill('2026-01-01');
    await page.getByLabel('结束日期', { exact: true }).fill('2026-06-30');
    await page.getByRole('button', { name: '开始同步', exact: true }).click();
    await expect(page.locator('.global-tip')).toHaveText('已提交后台同步，可继续浏览，稍后请手动刷新。');
    await expect(page.getByRole('button', { name: '2026-05-12', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.post-content')).toHaveText('新增博主本地正文');
    expect(requests.filter(value => value.startsWith('GET /post/list?') && !value.includes('keyword='))).toEqual(dayReads);
    expect(mutationParams).toEqual([['add', { uid: '1234' }], ['range', { uid: '1234', start: '2026-01-01 00:00:00', end: '2026-06-30 23:59:59' }]]);
    expect(writeRequests.map(value => new URL(value.slice(5)).pathname)).toEqual(['/weibo/login/qr', '/post/bloggers', '/post/range']);
    writeRequests = [];
    await page.screenshot({ path: testInfo.outputPath('combined-complete.png') });
  });
}

test('acceptance_minimum_media_preserves_square_tiles_single_image_and_failed_video_ratio', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 560 });
  posts = { ...posts, total: 3, items: [
    { ...posts.items[0], mblogId: 'single-minimum', pics: [imageFixture('single-minimum')] },
    { ...posts.items[0], mblogId: 'retweet-minimum', source: '很长来源'.repeat(60), retweeted: { screenName: '原作者', content: '转发图片',
      pics: Array.from({ length: 3 }, (_, index) => imageFixture(`minimum-${index}`)),
      video: { coverUrl: '/post/video-cover?mblogId=broken-video', pageUrl: 'https://video.example.test/minimum' } } },
    { ...posts.items[0], mblogId: 'pure-minimum', content: '', retweeted: { screenName: '原作者', content: '纯转发',
      pics: Array.from({ length: 3 }, (_, index) => imageFixture(`pure-minimum-${index}`)) } },
  ] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-card')).toHaveCount(3);
  await page.locator('.post-video').scrollIntoViewIfNeeded();
  await expect(page.locator('.post-video')).toHaveClass(/cover-failed/);
  expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const selector of ['.post-retweet-pic', '.post-video.cover-failed']) {
    for (const element of await page.locator(selector).all()) {
      const bounds = await element.boundingBox();
      expect(bounds!.width / bounds!.height).toBeCloseTo(selector.includes('video') ? 4 / 3 : 1, 2);
    }
  }
  expect(await page.locator('.post-pics.one-image .post-pic').evaluate(element => element.getBoundingClientRect().right <= element.closest('.post-card')!.getBoundingClientRect().right)).toBe(true);
});

test('sync_history_submits_shanghai_snapshot_without_refreshing_or_polling', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-08-05T18:30:00Z') });
  const writes: URL[] = [];
  await page.route('**/post/range?*', route => {
    writes.push(new URL(route.request().url()));
    calendar = { months: [{ month: '2026-08', count: 4, days: [{ date: '2026-08-06', count: 1 }, { date: '2026-08-05', count: 3 }] }] };
    return route.fulfill({ status: 204 });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.getByRole('button', { name: '同步历史', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  const reading = requests.filter(value => value.startsWith('GET /post/list?'));
  const calendarReads = requests.filter(value => value.startsWith('GET /post/calendar'));
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '同步历史微博', exact: true });
  await expect(dialog.getByLabel('开始日期')).toHaveValue('2024-08-06');
  await expect(dialog.getByLabel('结束日期')).toHaveValue('2026-08-06');
  await expect(dialog.locator('.search-overlay-tip')).toContainText('@第二位');
  await dialog.getByLabel('开始日期').fill('');
  await dialog.getByRole('button', { name: '开始同步' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('请选择开始与结束日期。');
  expect(writes).toHaveLength(0);
  await dialog.getByLabel('开始日期').fill('2026-07-01');
  await dialog.getByLabel('结束日期').fill('2026-07-31');
  await dialog.getByRole('button', { name: '开始同步' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('已提交后台同步，可继续浏览，稍后请手动刷新。');
  await expect(page.getByRole('button', { name: '同步历史', exact: true })).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('.dates-heading')).not.toContainText('同步完成');
  await expect(page.getByRole('button', { name: '2026-08-06', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('history-submitted.png') });
  await page.clock.runFor(610000);
  await expect(page.locator('.global-tip')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/calendar'))).toEqual(calendarReads);
  expect(requests.filter(value => value.startsWith('GET /post/list?'))).toEqual(reading);
  expect(Object.fromEntries(writes[0].searchParams)).toEqual({ uid: '2', start: '2026-07-01 00:00:00', end: '2026-07-31 23:59:59' });
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('sync_history_leap_defaults_order_same_day_cancel_and_reset', async ({ page }) => {
  await page.clock.install({ time: new Date('2024-02-28T18:00:00Z') });
  const calls: string[] = [];
  await page.route('**/post/range?*', route => { calls.push(route.request().url()); return route.fulfill({ status: 204 }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  const entry = page.getByRole('button', { name: '同步历史', exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '同步历史微博' });
  await expect(dialog.getByLabel('开始日期')).toHaveValue('2022-02-28');
  await expect(dialog.getByLabel('结束日期')).toHaveValue('2024-02-29');
  await dialog.getByLabel('开始日期').fill('2024-03-01');
  await dialog.getByRole('button', { name: '开始同步' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('开始日期不能晚于结束日期。');
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('开始日期').press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  expect(calls).toHaveLength(0);
  await entry.click();
  await expect(dialog.getByLabel('开始日期')).toHaveValue('2022-02-28');
  await expect(dialog.getByRole('alert')).toBeEmpty();
  await dialog.getByLabel('开始日期').fill('2024-02-29');
  await dialog.getByLabel('结束日期').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => calls.length).toBe(1);
  expect(new URL(calls[0]).searchParams.get('start')).toBe('2024-02-29 00:00:00');
  expect(new URL(calls[0]).searchParams.get('end')).toBe('2024-02-29 23:59:59');
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('sync_history_pending_request_keeps_snapshot_and_does_not_refresh_a_new_scope', async ({ page }) => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const calls: URL[] = [];
  await page.route('**/post/range?*', async route => { calls.push(new URL(route.request().url())); await gate; await route.fulfill({ status: 204 }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  const entry = page.getByRole('button', { name: '同步历史', exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '同步历史微博' });
  await dialog.getByLabel('开始日期').fill('2026-01-01');
  await dialog.getByLabel('结束日期').fill('2026-01-02');
  await dialog.getByRole('button', { name: '开始同步' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(entry).toHaveAttribute('aria-disabled', 'true');
  await entry.press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  await expect(page.locator('.post-content')).toContainText('第一行');
  const secondCalendar = requests.filter(value => value === 'GET /post/calendar?uid=2').length;
  finish();
  await expect(entry).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('.global-tip')).toHaveText('已提交后台同步，可继续浏览，稍后请手动刷新。');
  expect(requests.filter(value => value === 'GET /post/calendar?uid=2')).toHaveLength(secondCalendar);
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  expect(Object.fromEntries(calls[0].searchParams)).toEqual({ uid: '1', start: '2026-01-01 00:00:00', end: '2026-01-02 23:59:59' });
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

for (const responseStatus of [500, 401]) {
  test(`sync_history_error_${responseStatus}_uses_expected_feedback_without_reposting`, async ({ page }) => {
    await page.clock.install();
    await page.route('**/post/range?*', route => route.fulfill({ status: responseStatus, json: { msg: '本地采集失败' } }));
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    await page.getByRole('button', { name: '第一位', exact: true }).click();
    await page.getByRole('button', { name: '同步历史', exact: true }).click();
    await page.getByRole('button', { name: '开始同步' }).click();
    if (responseStatus === 401) {
      await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
      await expect(page.locator('.global-tip')).toHaveCount(0);
    } else {
      await expect(page.locator('.global-tip')).toHaveText('提交历史微博同步失败：本地采集失败');
      await page.clock.runFor(6100);
      await expect(page.locator('.global-tip')).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: '同步历史', exact: true })).toHaveAttribute('aria-disabled', 'false');
    expect(writeRequests).toHaveLength(1); writeRequests = [];
  });
}

test('sync_history_submission_does_not_read_calendar_or_repeat_post', async ({ page }) => {
  await page.route('**/post/range?*', route => { calendarStatus = 500; return route.fulfill({ status: 204 }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  const reads = [...requests];
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  await page.getByRole('button', { name: '开始同步' }).click();
  await expect(page.locator('.global-tip')).toHaveText('已提交后台同步，可继续浏览，稍后请手动刷新。');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  await expect(page.locator('.post-content')).toContainText('第一行');
  expect(requests).toEqual(reads);
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('sync_history_empty_scope_shows_captured_data_only_after_manual_refresh', async ({ page }) => {
  calendarsByUid['1'] = { months: [] };
  await page.route('**/post/range?*', route => { calendarsByUid['1'] = calendar; return route.fulfill({ status: 204 }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('暂无有博文的日期');
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  await page.getByRole('button', { name: '开始同步' }).click();
  await expect(page.locator('.global-tip')).toHaveText('已提交后台同步，可继续浏览，稍后请手动刷新。');
  await expect(page.locator('.dates-list')).toContainText('暂无有博文的日期');
  await expect(page.locator('.post-content')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('sync_history_submission_timeout_releases_form_without_auto_retry', async ({ page }) => {
  await page.clock.install();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/post/range?*', async route => { await gate; await route.fulfill({ status: 204 }).catch(() => {}); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  await page.getByRole('button', { name: '开始同步' }).click();
  const entry = page.getByRole('button', { name: '同步历史', exact: true });
  await expect(entry).toHaveAttribute('aria-disabled', 'true');
  const reads = [...requests];
  await page.clock.runFor(16000);
  await expect(entry).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('.global-tip')).toContainText('提交历史微博同步失败：请求超时');
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  await page.clock.runFor(6100);
  expect(requests).toEqual(reads);
  finish();
  await expect(page.locator('.global-tip')).toHaveCount(0);
  await entry.click();
  await expect(page.getByRole('dialog', { name: '同步历史微博' })).toBeVisible();
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('sync_history_dark_dialog_and_long_name_fit_minimum_window', async ({ page }, testInfo) => {

  bloggers[0] = { ...bloggers[0], screenName: '很长博主名称'.repeat(20) };
  await page.setViewportSize({ width: 900, height: 560 });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: bloggers[0].screenName, exact: true }).click();
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '同步历史微博' });
  await expect(dialog).toHaveCSS('background-color', 'rgb(3, 27, 40)');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: '开始同步' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '开始同步' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('sync-history.png') });
});

test('sync_history_unmount_aborts_local_request_without_applying_late_result', async ({ page }) => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/post/range?*', async route => { await gate; await route.fulfill({ status: 204 }).catch(() => {}); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await page.getByRole('button', { name: '同步历史', exact: true }).click();
  await page.getByRole('button', { name: '开始同步' }).click();
  await expect(page.getByRole('button', { name: '同步历史', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.goto('about:blank');
  finish();
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('add_blogger_validates_then_posts_uid_refreshes_and_selects_new_blogger', async ({ page }) => {
  const added = { uid: 1234567890, screenName: '新博主' };
  const calls: string[] = [];
  await page.route('**/post/bloggers?uid=*', async route => {
    calls.push(route.request().url());
    bloggers = [...bloggers, added];
    await route.fulfill({ json: added });
  });
  postsByUid[String(added.uid)] = { ...posts, total: 1, items: [{ ...posts.items[0], content: '新博主正文', blogger: added }] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('searchbox', { name: '搜索博主' }).fill('第一');
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加博主', exact: true });
  const input = dialog.getByRole('textbox', { name: 'UID 或主页链接' });
  await expect(input).toBeFocused();
  await input.fill('abc');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('无法识别');
  expect(calls).toHaveLength(0);
  await input.fill(' https://weibo.com/u/1234567890 ');
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.feed-header h2')).toHaveText('新博主的微博');
  await expect(page.locator('.post-content')).toHaveText('新博主正文');
  await expect(page.getByRole('searchbox', { name: '搜索博主' })).toHaveValue('第一');
  expect(new URL(calls[0]).search).toBe('?uid=1234567890');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('add_blogger_accepts_numeric_and_short_homepage_forms_and_resets_on_reopen', async ({ page }) => {
  const submitted: string[] = [];
  await page.route('**/post/bloggers?uid=*', route => {
    submitted.push(new URL(route.request().url()).searchParams.get('uid')!);
    return route.fulfill({ status: 500, json: { msg: '本地添加暂时失败' } });
  });
  await page.goto(`${baseUrl}post/index.html`);
  const entry = page.getByRole('button', { name: '添加博主', exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '添加博主', exact: true });
  const input = dialog.getByRole('textbox', { name: 'UID 或主页链接' });
  for (const [value, expected] of [[' 1234 ', '1234'], ['https://weibo.com/12345678?foo=bar', '12345678']]) {
    await input.fill(value);
    await dialog.getByRole('button', { name: '添加', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('本地添加暂时失败');
    expect(submitted.at(-1)).toBe(expected);
    await expect(input).toHaveValue(value);
  }
  expect(submitted).toHaveLength(2);
  await input.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  await entry.click();
  await expect(input).toHaveValue('');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(writeRequests).toHaveLength(2);
  writeRequests = [];
});

test('add_blogger_pending_cancel_keeps_one_write_and_preserves_later_selection', async ({ page }) => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/post/bloggers?uid=*', async route => { await gate; bloggers.push({ uid: 1234, screenName: '添加完成' }); await route.fulfill({ json: {} }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  const entry = page.getByRole('button', { name: '添加博主', exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '添加博主', exact: true });
  await dialog.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
  await dialog.getByRole('textbox', { name: 'UID 或主页链接' }).press('Enter');
  await expect(dialog.getByRole('button', { name: '添加', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveText('正在添加并拉取微博…');
  await dialog.getByRole('textbox', { name: 'UID 或主页链接' }).press('Enter');
  await dialog.getByRole('button', { name: '关闭添加博主', exact: true }).click();
  await expect(entry).toBeFocused();
  await entry.press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  finish();
  await expect(page.getByRole('button', { name: '添加完成', exact: true })).toBeVisible();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('add_blogger_list_refresh_failure_does_not_repeat_successful_post', async ({ page }) => {
  await page.route('**/post/bloggers?uid=*', route => { status = 500; return route.fulfill({ json: {} }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('博主加载失败');
  await expect(page.locator('.feed-header h2')).toHaveText('全部微博');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('add_blogger_401_uses_login_recovery_without_reposting', async ({ page }) => {
  await page.route('**/post/bloggers?uid=*', route => route.fulfill({ status: 401, json: { msg: '失效' } }));
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('add_blogger_timeout_releases_submit_without_automatic_retry', async ({ page }) => {
  await page.clock.install();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/post/bloggers?uid=*', async route => { await gate; await route.fulfill({ json: {} }).catch(() => {}); });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加', exact: true })).toBeDisabled();
  await page.clock.runFor(16000);
  await expect(page.getByRole('alert')).toContainText('请求超时');
  await expect(page.getByRole('button', { name: '添加', exact: true })).toBeEnabled();
  expect(writeRequests).toHaveLength(1);
  finish();
  writeRequests = [];
});

test('add_blogger_dark_modal_fits_minimum_viewport', async ({ page }, testInfo) => {

  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await expect(page.locator('.management-dialog')).toHaveCSS('width', '420px');
  await expect(page.locator('.management-dialog')).toHaveCSS('background-color', 'rgb(3, 27, 40)');
  await expect(page.locator('.management-dialog')).toHaveCSS('border-radius', '3px');
  await page.setViewportSize({ width: 900, height: 560 });
  await expect(page.getByRole('button', { name: '添加', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('add-blogger.png') });
});

test('add_blogger_later_scope_selection_wins_while_list_refresh_is_pending', async ({ page }) => {
  await page.route('**/post/bloggers?uid=*', route => {
    bloggers.push({ uid: 1234, screenName: '刷新后博主' });
    holdPath = '/post/bloggers'; holdResponse = true;
    return route.fulfill({ json: {} });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  holdResponse = false; releaseResponse!();
  await expect(page.getByRole('button', { name: '刷新后博主', exact: true })).toBeVisible();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

for (const navigation of ['date', 'search']) {
  test(`add_blogger_preserves_later_${navigation}_navigation_during_list_refresh`, async ({ page }) => {
    calendar.months[0].days.push({ date: '2026-08-04', count: 1 });
    searchPosts = { ...posts, total: 1, items: [{ ...posts.items[0], createdAt: Date.parse('2026-08-04T00:00:00Z') }] };
    await page.route('**/post/bloggers?uid=*', route => {
      bloggers.push({ uid: 1234, screenName: '添加后博主' });
      holdPath = '/post/bloggers'; holdResponse = true;
      return route.fulfill({ json: {} });
    });
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    await page.getByRole('button', { name: '添加博主', exact: true }).click();
    await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('1234');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => Boolean(releaseResponse)).toBe(true);
    if (navigation === 'date') await page.getByRole('button', { name: '2026-08-04', exact: true }).click();
    else {
      await page.getByRole('button', { name: '高级搜索', exact: true }).click();
      await page.getByLabel('关键词', { exact: true }).fill('第一');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page.locator('.search-result').click();
    }
    await expect(page.getByRole('button', { name: '2026-08-04', exact: true })).toHaveAttribute('aria-pressed', 'true');
    holdResponse = false; releaseResponse!();
    await expect(page.getByRole('button', { name: '添加后博主', exact: true })).toBeVisible();
    await expect(page.locator('.feed-header h2')).toHaveText('全部微博');
    await expect(page.getByRole('button', { name: '2026-08-04', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(writeRequests).toHaveLength(1); writeRequests = [];
  });
}

test('add_blogger_preserves_submitted_leading_zeros_and_selects_canonical_uid', async ({ page }) => {
  let submitted = '';
  await page.route('**/post/bloggers?uid=*', route => {
    submitted = new URL(route.request().url()).searchParams.get('uid')!;
    bloggers.push({ uid: 1234, screenName: '规范 UID 博主' });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: 'UID 或主页链接' }).fill('00001234');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('规范 UID 博主的微博');
  expect(submitted).toBe('00001234');
  expect(writeRequests).toHaveLength(1); writeRequests = [];
});

test('post_login_detects_invalid_status_without_hiding_local_reading_and_starts_only_on_click', async ({ page }) => {
  loginPayload = { valid: false };
  await page.route('**/weibo/login/qr', route => route.fulfill({ status: 500, json: { msg: '本地扫码失败' } }));
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  expect(requests.filter(value => value.includes('/weibo/login/status'))).toHaveLength(1);
  expect(writeRequests).toHaveLength(0);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect(page.locator('.login-expired')).toContainText('扫码登录失败，请重新扫码。');
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeEnabled();
  await expect(page.locator('.qr-loading')).toHaveText('暂无二维码');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('post_login_requires_strict_true_but_status_failure_stays_quiet', async ({ page }) => {
  for (const payload of [{}, null, { valid: 'true' }, { valid: 1 }]) {
    loginPayload = payload;
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
    await expect(page.locator('.qr-loading')).toHaveCount(0);
  }
  loginStatus = 500;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.locator('.login-expired')).toHaveCount(0);
});

for (const path of ['/post/bloggers', '/post/calendar', '/post/list']) {
  test(`post_login_reading_401_recovers_only_failed_active_query_${path.split('/').at(-1)}`, async ({ page }) => {
    if (path === '/post/bloggers') status = 401;
    if (path === '/post/calendar') calendarStatus = 401;
    if (path === '/post/list') listStatus = 401;
    await page.route('**/weibo/login/qr', async route => {
      status = calendarStatus = listStatus = 200;
      await route.fulfill({ json: {} });
    });
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: '扫码登录', exact: true }).click();
    await expect(page.locator('.login-expired')).toHaveCount(0);
    await expect(page.locator('.post-content')).toContainText('第一行');
    expect(requests.filter(value => value.includes('/weibo/login/status'))).toHaveLength(2);
    expect(writeRequests).toHaveLength(1);
    writeRequests = [];
  });
}

test('post_login_search_401_closes_modal_keeps_selection_and_failure_does_not_hide_prompt', async ({ page }) => {
  await page.route('**/weibo/login/qr', route => route.fulfill({ status: 500, json: {} }));
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('searchbox', { name: '搜索博主' }).fill('第一');
  searchStatus = 401;
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('失效');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '高级搜索', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  await expect(page.getByRole('searchbox', { name: '搜索博主' })).toHaveValue('第一');
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect(page.locator('.login-expired')).toContainText('扫码登录失败');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('post_login_qr_polling_keeps_last_image_and_stops_on_success', async ({ page }, testInfo) => {
  await page.clock.install();
  loginPayload = { valid: false };
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/weibo/login/qr', async route => { await gate; await route.fulfill({ json: {} }); });
  const images: string[] = [];
  let broken = false;
  await page.route('**/weibo/login/qr/image?*', route => {
    images.push(route.request().url());
    return route.fulfill({ status: broken ? 404 : 200, contentType: 'image/svg+xml', body: broken ? 'Missing QR' : '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><path d="M0 0h180v180H0z" fill="#2b2620"/></svg>' });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '扫码中…', exact: true })).toBeDisabled();
  await page.clock.runFor(2900);
  expect(images).toHaveLength(0);
  await page.clock.runFor(200);
  await expect(page.getByAltText('扫码登录二维码')).toBeVisible();
  const first = await page.getByAltText('扫码登录二维码').getAttribute('src');
  const firstCount = images.length;
  broken = true;
  await page.clock.runFor(7000);
  await expect.poll(() => images.length).toBeGreaterThan(firstCount);
  await expect(page.getByAltText('扫码登录二维码')).toHaveAttribute('src', first!);
  await page.screenshot({ path: testInfo.outputPath('post-qr.png') });
  loginPayload = { valid: true };
  finish();
  await expect(page.locator('.login-expired')).toHaveCount(0);
  const stopped = images.length;
  await page.clock.runFor(30000);
  expect(images).toHaveLength(stopped);
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('post_login_qr_first_image_failure_timeout_and_explicit_retry', async ({ page }) => {
  await page.clock.install();
  loginPayload = { valid: false };
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let attempts = 0;
  await page.route('**/weibo/login/qr', async route => { attempts++; if (attempts === 1) await gate; await route.fulfill({ status: 500, json: {} }).catch(() => {}); });
  await page.route('**/weibo/login/qr/image?*', route => route.fulfill({ status: 204 }));
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.clock.runFor(3100);
  await expect(page.locator('.qr-loading')).toHaveText('二维码加载重试…');
  await page.clock.runFor(358000);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeEnabled();
  await expect(page.locator('.qr-loading')).toHaveText('暂无二维码');
  await expect(page.locator('.login-expired')).toContainText('扫码登录失败');
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeEnabled();
  finish();
  expect(writeRequests).toHaveLength(2);
  writeRequests = [];
});

test('post_login_unmount_stops_polling_and_late_status_cannot_hide_pending_qr', async ({ page }) => {
  await page.clock.install();
  listStatus = 401;
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.route('**/weibo/login/status', async route => { await statusGate; await route.fulfill({ json: { valid: true } }).catch(() => {}); });
  let releaseQr!: () => void;
  const qrGate = new Promise<void>(resolve => { releaseQr = resolve; });
  await page.route('**/weibo/login/qr', async route => { await qrGate; await route.fulfill({ json: {} }).catch(() => {}); });
  const images: string[] = [];
  await page.route('**/weibo/login/qr/image?*', route => { images.push(route.request().url()); return route.fulfill({ status: 204 }); });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '扫码中…', exact: true })).toBeDisabled();
  releaseStatus();
  await page.clock.runFor(3100);
  await expect(page.locator('.qr-loading')).toHaveText('二维码加载重试…');
  await expect(page.getByRole('button', { name: '扫码中…', exact: true })).toBeDisabled();
  await page.goto('about:blank');
  const count = images.length;
  await page.clock.runFor(30000);
  expect(images).toHaveLength(count);
  releaseQr();
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('post_login_late_valid_status_does_not_clear_a_new_reading_401', async ({ page }) => {
  listStatus = 401;
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/weibo/login/status', async route => { await gate; await route.fulfill({ json: { valid: true } }); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
  const response = page.waitForResponse('**/weibo/login/status');
  finish();
  await response;
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeVisible();
});

test('post_login_completed_qr_does_not_poll_while_failed_reading_is_recovering', async ({ page }) => {
  await page.clock.install();
  loginPayload = { valid: false };
  listStatus = 401;
  const images: string[] = [];
  await page.route('**/weibo/login/qr/image?*', route => { images.push(route.request().url()); return route.fulfill({ status: 204 }); });
  await page.route('**/weibo/login/qr', route => {
    listStatus = 200;
    holdPath = '/post/list';
    holdResponse = true;
    return route.fulfill({ json: {} });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  await page.clock.runFor(3100);
  expect(images).toHaveLength(0);
  await expect(page.getByRole('button', { name: '扫码登录', exact: true })).toBeEnabled();
  holdResponse = false;
  releaseResponse!();
  await expect(page.locator('.post-content')).toContainText('第一行');
  expect(writeRequests).toHaveLength(1);
  writeRequests = [];
});

test('search_location_switches_shanghai_day_reveals_month_and_centers_exact_card', async ({ page }) => {
  calendar.months.push(
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2025-12', count: 30, days: [{ date: '2025-12-31', count: 30 }] },
  );
  const target = { ...posts.items[0], mblogId: 'result:a[0]"', createdAt: Date.parse('2025-12-30T17:00:00Z'), contentRaw: '跨年定位摘要', content: '目标完整正文' };
  searchPosts = { ...posts, total: 1, items: [target] };
  postsByDate['2025-12-31'] = { ...posts, total: 30, items: Array.from({ length: 30 }, (_, index) => index === 15 ? target : { ...target, mblogId: `other-${index}`, content: `其他完整正文 ${index}` }) };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByLabel('选择月份', { exact: true }).selectOption('07');
  await page.getByRole('searchbox', { name: '搜索博主' }).fill('第一');
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '高级搜索' });
  await dialog.getByLabel('关键词', { exact: true }).fill('定位');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  const result = dialog.locator('.search-result');
  await expect(result).toContainText('跨年定位摘要');
  expect(await result.evaluate(element => element.tagName)).toBe('BUTTON');
  await result.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '高级搜索', exact: true })).toBeFocused();
  await expect(page.getByLabel('选择年份', { exact: true })).toHaveValue('2025');
  await expect(page.getByLabel('选择月份', { exact: true })).toHaveValue('12');
  await expect(page.getByRole('button', { name: '2025-12-31', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', { name: '搜索博主' })).toHaveValue('第一');
  const card = page.locator('.post-card').filter({ hasText: '目标完整正文' });
  await expect(card).toHaveClass(/flash-highlight/);
  await expect(page.locator('.post-card.flash-highlight')).toHaveCount(1);
  await expect.poll(async () => card.evaluate(element => {
    const card = element.getBoundingClientRect();
    const pane = element.closest('.posts')!.getBoundingClientRect();
    return Math.abs((card.top + card.bottom - pane.top - pane.bottom) / 2);
  })).toBeLessThan(3);
  const last = new URL(requests.filter(value => value.startsWith('GET /post/list?')).at(-1)!.slice(4), 'http://fixture');
  expect(Object.fromEntries(last.searchParams)).toEqual({ page: '1', size: '9999', start: '2025-12-31 00:00:00', end: '2025-12-31 23:59:59' });
  await expect(card).not.toHaveClass(/flash-highlight/);
  await page.getByLabel('选择月份', { exact: true }).selectOption('11');
  await expect(page.getByRole('button', { name: '2025-12-31', exact: true })).toBeHidden();
});

for (const scenario of ['image_load', 'image_error', 'video_load', 'long_post', 'user_wheel', 'user_keyboard']) {
  test(`search_location_settles_delayed_media_${scenario}`, async ({ page }) => {
    const target: PostList['items'][number] = { ...posts.items[0], mblogId: 'delayed-image', content: '遭拒后的目标完整正文',
      pics: [imageFixture('delayed-center', scenario === 'image_error' ? {} : { thumbnailWidth: 0, thumbnailHeight: 0, originalWidth: 0, originalHeight: 0 })] };
    if (scenario === 'video_load') {
      target.pics = null;
      target.video = { coverUrl: '/post/video-cover?mblogId=delayed-image', pageUrl: 'https://video.example.test/target' };
    }
    if (scenario === 'long_post') target.content += '\n长微博正文'.repeat(80);
    searchPosts = { ...posts, total: 1, items: [target] };
    let releaseImage: (() => Promise<void>) | undefined;
    await page.route(url => url.searchParams.get('pid') === 'delayed-center' || url.pathname === '/post/video-cover', async route => {
      await new Promise<void>(resolve => {
        releaseImage = async () => {
          releaseImage = undefined;
          await route.fulfill(scenario === 'image_error' ? { status: 404 } : { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" />' });
          resolve();
        };
      });
    });
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.getByRole('article')).toHaveCount(1);
    postsByDate['2026-08-05'] = { ...posts, total: 30, items: Array.from({ length: 30 }, (_, index) => index === 15 ? target : { ...posts.items[0], mblogId: `other-${index}` }) };
    await page.getByRole('button', { name: '高级搜索', exact: true }).click();
    await page.getByLabel('关键词', { exact: true }).fill('遭拒');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.search-result').click();
    const card = page.getByRole('article').filter({ hasText: '遭拒后的目标完整正文' });
    const centerOffset = () => card.evaluate(element => {
      const card = element.getBoundingClientRect();
      const pane = element.closest('.posts')!.getBoundingClientRect();
      return Math.abs((card.top + card.bottom - pane.top - pane.bottom) / 2);
    });
    try {
      await expect.poll(centerOffset).toBeLessThan(3);
      await expect.poll(() => Boolean(releaseImage)).toBe(true);
      const userScroll = scenario.startsWith('user_');
      if (userScroll) {
        const pane = page.locator('.posts');
        if (scenario === 'user_wheel') {
          await pane.hover();
          await page.mouse.wheel(0, 600);
        } else {
          await pane.focus();
          await page.keyboard.press('PageDown');
        }
        await expect.poll(centerOffset).toBeGreaterThan(200);
      }
      await releaseImage!();
      if (scenario === 'image_error') await expect(card.locator('.post-pic')).toBeHidden();
      else await expect.poll(() => card.locator('.post-pic img, .post-video img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (userScroll) expect(await centerOffset()).toBeGreaterThan(200);
      else await expect.poll(centerOffset).toBeLessThan(3);
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    } finally { await releaseImage?.(); }
  });
}

test('search_location_keeps_scope_and_filter_reloads_same_day_with_enter_and_space', async ({ page }) => {
  const target = { ...posts.items[0], mblogId: 'same-day', content: '完整同日正文', blogger: bloggers[1] };
  postsByUid['2'] = { ...posts, total: 1, items: [target] };
  searchPosts = { ...posts, total: 1, items: [{ ...target, contentRaw: '同日摘要' }] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.post-content')).toHaveText('完整同日正文');
  await page.getByRole('searchbox', { name: '搜索博主' }).fill('第一');
  for (const key of ['Enter', 'Space']) {
    await page.getByRole('button', { name: '高级搜索', exact: true }).click();
    await page.getByLabel('关键词', { exact: true }).fill('同日');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    const result = page.locator('.search-result');
    await expect(result).toContainText('同日摘要');
    const count = requests.filter(value => value.startsWith('GET /post/list?') && !value.includes('keyword=')).length;
    await result.focus();
    await result.press(key);
    await expect(page.locator('.post-card.flash-highlight')).toContainText('完整同日正文');
    expect(requests.filter(value => value.startsWith('GET /post/list?') && !value.includes('keyword='))).toHaveLength(count + 1);
    const query = requests.filter(value => value.startsWith('GET /post/list?')).at(-1)!;
    expect(query).toContain('uids=2');
    expect(query).not.toContain('keyword=');
    await expect(page.getByRole('searchbox', { name: '搜索博主' })).toHaveValue('第一');
    await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  }
  await page.getByRole('button', { name: '2026-08-05', exact: true }).click();
  await expect(page.locator('.post-content')).toHaveText('完整同日正文');
  await expect(page.locator('.flash-highlight')).toHaveCount(0);
});

test('search_location_preempts_pending_day_and_ignores_its_late_response', async ({ page }) => {
  const target = { ...posts.items[0], mblogId: 'july', createdAt: Date.parse('2026-07-10T00:00:00Z'), content: '新的七月正文' };
  searchPosts = { ...posts, total: 1, items: [target] };
  postsByDate['2026-07-10'] = searchPosts;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  holdResponse = true;
  holdPath = '/post/list';
  await page.getByRole('button', { name: '2026-08-05', exact: true }).click();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  const releaseOld = releaseResponse!;
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('七月');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result')).toContainText('新的七月正文');
  holdResponse = false;
  await page.locator('.search-result').click();
  await expect(page.locator('.post-card.flash-highlight')).toContainText('新的七月正文');
  releaseOld();
  await expect(page.locator('.post-content')).toHaveText('新的七月正文');
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-07-10');
});

test('search_location_failed_day_retries_before_highlighting', async ({ page }) => {
  const target = { ...posts.items[0], mblogId: 'retry-day', content: '重试后的完整正文' };
  searchPosts = { ...posts, total: 1, items: [target] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('重试');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result')).toContainText('重试后的完整正文');
  listStatus = 500;
  await page.locator('.search-result').click();
  await expect(page.getByRole('alert')).toContainText('博文加载失败');
  await expect(page.locator('.flash-highlight')).toHaveCount(0);
  listStatus = 200;
  posts = { ...posts, items: [target] };
  await page.getByRole('button', { name: '重试博文', exact: true }).click();
  await expect(page.locator('.post-card.flash-highlight')).toContainText('重试后的完整正文');
});

test('search_location_new_scope_discards_pending_target_and_cleanup_has_no_late_highlight', async ({ page }) => {
  searchPosts = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'old-target', content: '旧目标' }] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('旧');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result')).toContainText('旧目标');
  holdResponse = true;
  holdPath = '/post/list';
  await page.locator('.search-result').click();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  const releaseOld = releaseResponse!;
  holdResponse = false;
  postsByUid['2'] = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'old-target', content: '新范围正文', blogger: bloggers[1] }] };
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.post-content')).toHaveText('新范围正文');
  releaseOld();
  await expect(page.locator('.flash-highlight')).toHaveCount(0);
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
});

test('search_location_missing_target_does_not_highlight_another_card_or_scroll', async ({ page }) => {
  searchPosts = { ...posts, total: 1, items: [{ ...posts.items[0], mblogId: 'missing', content: '缺失摘要' }] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('缺失');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result')).toContainText('缺失摘要');
  await page.locator('.search-result').click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.locator('.flash-highlight')).toHaveCount(0);
  expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBe(0);
});

test('search_location_reduced_motion_uses_static_starry_highlight_then_clears', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  searchPosts = { ...posts, total: 1, items: posts.items };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('第一');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result')).toContainText('第一行');
  await page.locator('.search-result').click();
  const card = page.locator('.post-card');
  await expect(card).toHaveClass(/flash-highlight/);
  await expect(card).toHaveCSS('animation-name', 'none');
  await expect(card).toHaveCSS('background-color', 'rgb(11, 56, 83)');
  await page.screenshot({ path: testInfo.outputPath('reduced-location.png') });
  await expect(card).not.toHaveClass(/flash-highlight/);
});

test('advanced_search_opens_with_shanghai_defaults_resets_and_restores_focus_without_querying', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-05T18:30:00Z') });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  const initialRequests = [...requests];
  const open = page.getByRole('button', { name: '高级搜索', exact: true });
  await expect(open).toBeVisible();
  await open.click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('关键词', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('起止日期', { exact: true })).toHaveValue('2010-01-01');
  await expect(dialog.getByLabel('至', { exact: true })).toHaveValue('2026-08-06');
  await expect(dialog).toContainText('在「全部博主」范围内搜索。');
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('关键词', { exact: true }).fill('尚未提交');
  await page.keyboard.press('Escape');
  await expect(dialog.getByLabel('关键词', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(dialog.getByLabel('关键词', { exact: true })).toHaveValue('');
  await expect(dialog.locator('.search-result')).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭高级搜索' }).click();
  await expect(open).toBeFocused();
  expect(requests).toEqual(initialRequests);
});

test('advanced_search_validates_and_sends_trimmed_keyword_scope_dates_and_optional_bounds', async ({ page }) => {
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  await expect(page.locator('.post-content')).toContainText('第一行');
  const readingRequests = requests.filter(value => !value.includes('keyword='));
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  await expect(dialog).toContainText('在「@第二位」范围内搜索。');
  const keyword = dialog.getByLabel('关键词', { exact: true });
  const submit = dialog.getByRole('button', { name: '搜索', exact: true });
  await keyword.fill('   ');
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('请输入关键词。');
  await keyword.fill('  关键词  ');
  await dialog.getByLabel('起止日期', { exact: true }).fill('2026-08-31');
  await dialog.getByLabel('至', { exact: true }).fill('2026-08-01');
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('开始日期不能晚于结束日期。');
  expect(requests.filter(value => value.includes('keyword='))).toEqual([]);
  await dialog.getByLabel('起止日期', { exact: true }).fill('2026-08-01');
  await dialog.getByLabel('至', { exact: true }).fill('2026-08-31');
  await keyword.press('Enter');
  await expect(dialog.getByRole('status')).toHaveText('找到 1 条结果');
  const query = new URL(requests.find(value => value.includes('keyword='))!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ keyword: '关键词', page: '1', size: '1000', uids: '2', start: '2026-08-01 00:00:00', end: '2026-08-31 23:59:59' });
  await dialog.getByLabel('起止日期', { exact: true }).fill('');
  await dialog.getByLabel('至', { exact: true }).fill('');
  await submit.click();
  await expect.poll(() => requests.filter(value => value.includes('keyword=')).length).toBe(2);
  await expect(dialog.getByRole('status')).toHaveText('找到 1 条结果');
  const unbounded = new URL(requests.filter(value => value.includes('keyword=')).at(-1)!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(unbounded)).toEqual({ keyword: '关键词', page: '1', size: '1000', uids: '2' });
  expect(requests.filter(value => !value.includes('keyword='))).toEqual(readingRequests);
  await dialog.getByRole('button', { name: '关闭高级搜索' }).click();
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
});

test('advanced_search_snippets_keep_order_plain_text_first_highlight_and_submitted_keyword', async ({ page, context }) => {
  const raw = '前'.repeat(35) + 'Needle' + '后'.repeat(35) + ' Needle';
  searchPosts = { ...posts, total: 4, items: [
    { ...posts.items[0], mblogId: 'first', contentRaw: raw },
    { ...posts.items[0], mblogId: 'fallback', contentRaw: null, content: '<b>Needle</b> &lt;img src=x onerror=window.searchAttack=1&gt;', blogger: null },
    { ...posts.items[0], mblogId: 'literal', contentRaw: '<script>Needle</script><a href="https://bad.example.test/">文字</a>' },
    { ...posts.items[0], mblogId: 'no-match', contentRaw: '没有匹配'.repeat(30) },
  ] };
  const external: string[] = [];
  await context.route('https://bad.example.test/**', route => { external.push(route.request().url()); return route.abort(); });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  const keyword = dialog.getByLabel('关键词', { exact: true });
  holdSearch = true;
  await keyword.fill('needle');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('搜索中…');
  await keyword.fill('等待中改了输入');
  await expect.poll(() => Boolean(releaseSearch)).toBe(true);
  holdSearch = false;
  releaseSearch!();
  await expect(dialog.getByRole('status')).toHaveText('找到 4 条结果');
  const snippets = dialog.locator('.search-result-snippet');
  await expect(snippets).toHaveText(['…' + '前'.repeat(30) + 'Needle' + '后'.repeat(30) + '…', 'Needle <img src=x onerror=window.sea…', '<script>Needle</script><a href="https://bad.…', '没有匹配'.repeat(20)]);
  await expect(snippets.first().locator('mark')).toHaveText('Needle');
  await expect(dialog.locator('.search-result-meta').nth(1)).toHaveText('2026-08-05 08:30 · 未知博主');
  await expect(dialog.locator('.search-result b, .search-result img, .search-result a, .search-result script')).toHaveCount(0);
  await expect(dialog.locator('.search-result button')).toHaveCount(0);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { searchAttack?: number }).searchAttack)).toBeUndefined();
});

test('advanced_search_empty_limit_and_error_allow_explicit_same_condition_retry', async ({ page }) => {
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  const keyword = dialog.getByLabel('关键词', { exact: true });
  const submit = dialog.getByRole('button', { name: '搜索', exact: true });
  searchStatus = 500;
  await keyword.fill('条件');
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('搜索失败：本地搜索暂时不可用');
  await expect(submit).toBeEnabled();
  expect(requests.filter(value => value.includes('keyword='))).toHaveLength(1);
  searchStatus = 200;
  searchPosts = { ...searchPosts, items: [], total: 0 };
  await submit.click();
  await expect(dialog.locator('.search-empty')).toHaveText('未找到匹配微博');
  await expect(dialog.locator('.search-result')).toHaveCount(0);
  for (const total of [1000, 1001]) {
    searchPosts = { ...posts, total };
    await submit.click();
    await expect(dialog.getByRole('status')).toHaveText(total === 1000 ? '找到 1000 条结果' : '已达上限（1001 条），请缩小范围');
  }
  const queries = requests.filter(value => value.includes('keyword='));
  expect(queries).toHaveLength(4);
  expect(queries.every(value => value === queries[0])).toBe(true);
  expect(new URL(queries[0].slice(4), 'http://fixture').searchParams.has('uids')).toBe(false);
});

test('advanced_search_close_cancels_old_request_and_reopen_isolates_next_search', async ({ page }) => {
  const canceled: string[] = [];
  page.on('requestfailed', request => { if (request.url().includes('keyword=')) canceled.push(request.url()); });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  const readingRequests = requests.filter(value => !value.includes('keyword='));
  const open = page.getByRole('button', { name: '高级搜索', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  holdSearch = true;
  await dialog.getByLabel('关键词', { exact: true }).fill('旧请求');
  await dialog.getByLabel('关键词', { exact: true }).press('Enter');
  const submit = dialog.getByRole('button', { name: '搜索', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('关键词', { exact: true }).press('Enter');
  await expect.poll(() => Boolean(releaseSearch)).toBe(true);
  const oldResponse = releaseSearch!;
  await dialog.getByRole('button', { name: '关闭高级搜索' }).click();
  await expect.poll(() => canceled.length).toBe(1);
  await expect(open).toBeFocused();
  holdSearch = false;
  searchPosts.items[0].contentRaw = '新请求结果';
  await open.click();
  await expect(dialog.locator('.search-result')).toHaveCount(0);
  await dialog.getByLabel('关键词', { exact: true }).fill('新请求');
  await submit.click();
  await expect(dialog.locator('.search-result-snippet')).toHaveText('新请求结果');
  oldResponse();
  await expect(dialog.locator('.search-result-snippet')).toHaveText('新请求结果');
  expect(requests.filter(value => value.includes('keyword='))).toHaveLength(2);
  expect(requests.filter(value => !value.includes('keyword='))).toEqual(readingRequests);
});

for (const viewport of [{ width: 900, height: 560 }, { width: 1280, height: 800 }]) {
  test(`advanced_search_long_results_stay_inside_viewport_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    searchPosts.items = Array.from({ length: 30 }, (_, index) => ({ ...searchPosts.items[0], mblogId: `search-${index}`, contentRaw: `关键词结果 ${index}` }));
    searchPosts.total = 30;
    await page.goto(`${baseUrl}post/index.html`);
    await page.getByRole('button', { name: '高级搜索', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
    await dialog.getByLabel('关键词', { exact: true }).fill('关键词');
    await dialog.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(dialog.locator('.search-result')).toHaveCount(30);
    const window = (await dialog.locator('.search-overlay-window').boundingBox())!;
    expect(window.height).toBeLessThanOrEqual(viewport.height * .8);
    expect(window.x).toBeGreaterThanOrEqual(0);
    expect(window.y).toBeGreaterThanOrEqual(0);
    expect(window.x + window.width).toBeLessThanOrEqual(viewport.width);
    const body = dialog.locator('.search-overlay-body');
    expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await body.hover();
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('search-results.png') });
  });
}

test('advanced_search_timeout_releases_submit_without_restarting_reading', async ({ page }) => {
  await page.clock.install();
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  const readingRequests = [...requests];
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '高级搜索', exact: true });
  holdSearch = true;
  await dialog.getByLabel('关键词', { exact: true }).fill('超时');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('搜索中…');
  await page.clock.runFor(31000);
  await expect(dialog.getByRole('alert')).toContainText('请求超时，请稍后重试');
  await expect(dialog.getByRole('button', { name: '搜索', exact: true })).toBeEnabled();
  expect(requests.filter(value => !value.includes('keyword='))).toEqual(readingRequests);
});

test('advanced_search_dark_form_and_result_keep_readable_controls', async ({ page }, testInfo) => {

  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '高级搜索', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('关键词');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.search-result mark')).toHaveText('关键词');
  await expect(page.locator('.search-overlay-window')).toHaveCSS('width', '520px');
  await expect(page.locator('.search-overlay-window')).toHaveCSS('background-color', 'rgb(3, 27, 40)');
  await expect(page.locator('.search-result-snippet')).toHaveCSS('color', 'rgb(228, 238, 245)');
  await expect(page.locator('.search-result')).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('.search-result-meta')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await page.screenshot({ path: testInfo.outputPath('starry-search.png') });
});

test('blogger_name_filter_matches_locally_and_keeps_all_row_total_and_order', async ({ page }) => {
  bloggers = [{ uid: 1, screenName: '第一位 Alice [1]' }, { uid: 2, screenName: '第二位 BOB' }, { uid: 3, screenName: '第三位 ALICE' }];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  const initialRequests = [...requests];
  const search = page.getByRole('searchbox', { name: '搜索博主' });
  for (const [keyword, names] of [
    [' aLiCe ', ['第一位 Alice [1]', '第三位 ALICE']],
    ['第二', ['第二位 BOB']],
    ['[', ['第一位 Alice [1]']],
    ['不存在', []],
    ['   ', bloggers.map(blogger => blogger.screenName)],
    ['', bloggers.map(blogger => blogger.screenName)],
  ] as [string, string[]][]) {
    await search.fill(keyword);
    await expect(page.getByRole('list', { name: '博主' }).getByRole('button').locator('.blogger-name')).toHaveText(names);
    await expect(page.getByRole('button', { name: '全部博主', exact: true })).toBeVisible();
    await expect(page.locator('.bloggers-heading')).toContainText('3 位博主');
  }
  await search.press('Enter');
  expect(requests).toEqual(initialRequests);
});

test('blogger_name_filter_hides_selected_row_without_changing_reading_or_selection', async ({ page }) => {
  calendarsByUid['2'] = { months: [{ month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] }] };
  postsByUid['2'] = { ...posts, items: [{ ...posts.items[0], mblogId: 'second', content: '第二位本地正文', blogger: bloggers[1] }] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.locator('.post-content')).toHaveText('第二位本地正文');
  const selectedRequests = [...requests];
  const search = page.getByRole('searchbox', { name: '搜索博主' });
  await search.fill('第一');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveCount(0);
  await expect(page.locator('.feed-header h2')).toHaveText('第二位的微博');
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-07-10');
  await expect(page.locator('.post-content')).toHaveText('第二位本地正文');
  expect(requests).toEqual(selectedRequests);
  await search.fill('');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await search.fill('第一');
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-08-05');
  await expect(search).toHaveValue('第一');
  await search.fill('不存在');
  await page.getByRole('button', { name: '全部博主', exact: true }).click();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.locator('.feed-header h2')).toHaveText('全部微博');
  await expect(search).toHaveValue('不存在');
  expect(new URL(requests.filter(value => value.startsWith('GET /post/list')).at(-1)!.slice(4), 'http://fixture').searchParams.has('uids')).toBe(false);
});

test('blogger_name_filter_applies_to_late_data_without_restarting_queries', async ({ page }) => {
  holdResponse = true;
  await page.goto(`${baseUrl}post/index.html`);
  const search = page.getByRole('searchbox', { name: '搜索博主' });
  await search.fill('第二');
  await expect(page.getByRole('status')).toHaveText('正在加载博主……');
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers']);
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  holdResponse = false;
  releaseResponse!();
  await expect(page.getByRole('list', { name: '博主' }).getByRole('button').locator('.blogger-name')).toHaveText(['第二位']);
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(search).toHaveValue('第二');
  expect(requests.filter(value => value === 'GET /post/bloggers')).toHaveLength(1);
});

test('blogger_name_filter_keyboard_skips_hidden_rows_and_keeps_failed_avatar_state', async ({ page }) => {
  bloggers[0].avatar = 'https://avatar.test/broken.svg';
  await page.goto(`${baseUrl}post/index.html`);
  const first = page.getByRole('button', { name: '第一位', exact: true });
  await expect(first.locator('.blogger-avatar')).toHaveText('第');
  await expect(page.locator('.post-content')).toContainText('第一行');
  const mediaRequests = requests.filter(value => value.startsWith('GET /chat/image'));
  expect(mediaRequests).toHaveLength(1);
  const search = page.getByRole('searchbox', { name: '搜索博主' });
  await search.fill('第二');
  await expect(search).toHaveCSS('outline-width', '3px');
  await expect(search).toHaveCSS('outline-offset', '2px');
  await search.press('Tab');
  await expect(page.getByRole('button', { name: '添加博主', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '全部博主', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toBeFocused();
  await search.fill('');
  await expect(first.locator('.blogger-avatar')).toHaveText('第');
  expect(requests.filter(value => value.startsWith('GET /chat/image'))).toEqual(mediaRequests);
  await search.press('ControlOrMeta+A');
  await search.press('Backspace');
  await expect(page.getByRole('list', { name: '博主' }).getByRole('button')).toHaveCount(2);
});

test('post_images_use_thumbnail_grid_and_original_fallback_before_viewing', async ({ page }) => {
  posts.items[0].pics = [
    { pid: 'p1', thumbnailWidth: 300, thumbnailHeight: 180, originalWidth: 1200, originalHeight: 720, thumbnailUrl: '/post/image?mblogId=local-1&pid=p1&variant=thumbnail', originalUrl: '/post/image?mblogId=local-1&pid=p1&variant=original' },
    { pid: 'p2', thumbnailWidth: 0, thumbnailHeight: 0, originalWidth: 300, originalHeight: 180, thumbnailUrl: '', originalUrl: '/post/image?mblogId=local-1&pid=p2&variant=original' },
  ];
  await page.goto(`${baseUrl}post/index.html`);
  const images = page.getByRole('img', { name: '微博图片', exact: true });
  await expect(images).toHaveCount(2);
  await expect(images.first()).toHaveAttribute('src', '/post/image?mblogId=local-1&pid=p1&variant=thumbnail');
  await expect(images.last()).toHaveAttribute('src', '/post/image?mblogId=local-1&pid=p2&variant=original');
  await expect.poll(() => images.first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(page.locator('.post-pic').first()).toHaveCSS('width', '120px');
  await expect(page.locator('.post-pic').first()).toHaveCSS('height', '120px');
  await expect(page.locator('.post-pics')).toHaveCSS('gap', '6px');
  await expect(images.first()).toHaveAttribute('loading', 'lazy');
  await expect(images.first()).toHaveAttribute('decoding', 'async');
  await expect(images.first()).toHaveAttribute('width', '300');
  await expect(page.locator('.post-pic a, a.post-pic')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/image'))).toEqual([
    'GET /post/image?mblogId=local-1&pid=p1&variant=thumbnail',
    'GET /post/image?mblogId=local-1&pid=p2&variant=original',
  ]);
});

test('post_metadata_keeps_backend_text_order_typography_and_empty_field_behavior', async ({ page }) => {
  posts.items[0].region = '发布于 上海';
  posts.items[0].source = '<b>网页端</b>';
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-region')).toHaveText('发布于 上海');
  await expect(page.locator('.post-source')).toHaveText('<b>网页端</b>');
  await expect(page.locator('.post-source b')).toHaveCount(0);
  await expect(page.locator('.post-region')).toHaveCSS('font-size', '12px');
  await expect(page.locator('.post-region')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await expect(page.locator('.post-source')).toHaveCSS('font-size', '12px');
  expect(await page.locator('.post-region').evaluate(element => getComputedStyle(element, '::before').content)).toBe('" · "');
  expect(await page.locator('.post-source').evaluate(element => getComputedStyle(element, '::before').content)).toBe('" · 来自 "');
  expect(await page.locator('.post-meta > *').evaluateAll(elements => elements.map(element => element.className))).toEqual(['post-time', 'post-region', 'post-source']);
  posts.items[0].region = null;
  posts.items[0].source = '';
  await page.reload();
  await expect(page.locator('.post-content')).toContainText('第一行');
  await expect(page.locator('.post-region, .post-source')).toHaveCount(0);
  await expect(page.locator('.post-header')).toContainText('第一位');
});

test('post_links_open_homepage_and_original_with_keyboard_and_preserve_reading_state', async ({ page, context }) => {
  posts.items[0].postUrl = 'https://weibo.com/1/local-1';
  posts.items[0].content = Array(35).fill('本地长正文').join('\n');
  posts.items[0].blogger!.verified = true;
  await context.route('https://weibo.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Weibo fixture</h1>' }));
  await page.goto(`${baseUrl}post/index.html`);
  const homepage = page.getByRole('link', { name: '前往 第一位 的微博首页', exact: true });
  const original = page.getByRole('link', { name: '查看原文', exact: true });
  await expect(homepage).toHaveAttribute('href', 'https://weibo.com/u/1');
  await expect(homepage).toHaveText('第');
  await expect(page.locator('.post-author').getByLabel('已认证')).toBeVisible();
  await expect(page.locator('.blogger-row a, .post-author a')).toHaveCount(0);
  await expect(original).toHaveAttribute('href', posts.items[0].postUrl);
  for (const [index, link] of [homepage, original].entries()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    await expect(link).toHaveCSS('text-decoration-line', 'none');
    await link.hover();
    await expect(link).toHaveCSS('text-decoration-line', index ? 'underline' : 'none');
    await expect(link).toHaveCSS('text-decoration-style', 'solid');
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('outline-style', 'solid');
    await expect(link).toHaveCSS('outline-width', '3px');
    const scrollTop = await page.locator('.posts').evaluate(element => element.scrollTop);
    if (index) expect(scrollTop).toBeGreaterThan(0);
    const opened = page.waitForEvent('popup');
    if (index) await page.keyboard.press('Enter');
    else await link.click();
    const popup = await opened;
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(index ? posts.items[0].postUrl! : 'https://weibo.com/u/1');
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await expect(page).toHaveURL(`${baseUrl}post/index.html`);
    expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBe(scrollTop);
    await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-08-05');
    await expect(page.getByRole('button', { name: '全部博主', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(requests.filter(value => value.startsWith('GET /post/list'))).toHaveLength(1);
});

test('post_links_omit_unsafe_urls_and_invalid_uids_without_changing_avatar_fallback', async ({ page }) => {
  const invalidUrls = [undefined, null, '', 'javascript:alert(1)', 'data:text/html,unsafe', 'file:///tmp/test', '/relative', '//weibo.com/1/test', 'https://[broken'];
  const invalidUids = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN];
  posts.items = invalidUrls.map((postUrl, index) => ({ ...posts.items[0], mblogId: `invalid-${index}`, postUrl,
    blogger: index === 0 ? null : { uid: invalidUids[index % invalidUids.length], screenName: '占位博主', avatar: '/missing-avatar' } }));
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('article')).toHaveCount(invalidUrls.length);
  await expect(page.locator('.post-link, a.post-avatar')).toHaveCount(0);
  await expect(page.locator('.post-avatar').first()).toHaveText('?');
  await expect(page.locator('.post-avatar').last()).toHaveText('占');
  await expect(page.locator('.post-avatar[aria-hidden="true"]')).toHaveCount(invalidUrls.length);
  await expect(page.locator('.post-avatar img')).toHaveCount(0);
  posts.items = [{ ...posts.items[1], mblogId: 'http-original', postUrl: 'http://weibo.com/1/plain', blogger: { uid: 1, screenName: '', avatar: '/missing-avatar' } }];
  await page.reload();
  await expect(page.getByRole('link', { name: '查看原文', exact: true })).toHaveAttribute('href', 'http://weibo.com/1/plain');
  await expect(page.getByRole('link', { name: '前往 博主 的微博首页', exact: true })).toHaveText('?');
});

for (const width of [1280, 1600]) {
  test(`post_complete_metadata_cards_keep_footer_and_original_at_${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    posts.items[0] = { ...posts.items[0], source: '网页端', region: '发布于 上海', postUrl: 'https://weibo.com/1/local-1' };
    posts.items.push({ ...posts.items[0], mblogId: 'pure', content: '', postUrl: 'https://weibo.com/1/pure', retweeted: { screenName: '原作者', content: '转发正文' } });
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('article')).toHaveCount(2);
    for (const card of await page.locator('article').all()) {
      const content = (await card.locator('.post-content, .post-retweet').boundingBox())!;
      const footer = (await card.locator('.post-actions').boundingBox())!;
      expect(footer.y).toBeGreaterThanOrEqual(content.y + content.height);
      await expect(card.locator('.post-time')).toHaveCSS('font-size', '12px');
      await expect(card.locator('.post-region')).toHaveText('发布于 上海');
    }
    expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const pure = page.locator('article').last();
    await expect(pure).toHaveClass('post-card pure-retweet');
    await expect(pure.locator('.post-avatar, .post-content')).toHaveCount(0);
    await expect(pure.locator('.post-link')).toHaveAttribute('href', 'https://weibo.com/1/pure');
    await expect(pure.locator('.post-region')).toHaveText('发布于 上海');
    await expect(pure.locator('.post-source')).toHaveText('网页端');
    await page.screenshot({ path: testInfo.outputPath('react-metadata.png') });
    posts.items[0].source = '长来源'.repeat(100);
    posts.items[1].source = null;
    posts.items[1].region = '';
    await page.reload();
    const source = page.locator('.post-source');
    await expect(source).toHaveText(posts.items[0].source);
    await expect(source).toHaveCSS('text-overflow', 'ellipsis');
    expect(await source.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(pure.locator('.post-source, .post-region')).toHaveCount(0);
  });
}

test('video_card_reads_cover_and_opens_the_video_page_with_no_opener', async ({ page, context }) => {
  posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=local-1', pageUrl: 'https://video.example.test/watch/outer' };
  await context.route('https://video.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Video fixture</h1>' }));
  await page.goto(`${baseUrl}post/index.html`);
  const link = page.getByRole('link', { name: '播放微博视频', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  await expect(link.locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(link.locator('img')).toHaveAttribute('decoding', 'async');
  await expect.poll(() => link.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(link.locator('img')).toHaveCSS('width', '320px');
  const cover = (await link.locator('img').boundingBox())!;
  const play = (await link.locator('.post-video-play').boundingBox())!;
  expect(play.x + play.width / 2).toBeCloseTo(cover.x + cover.width / 2, 1);
  expect(play.y + play.height / 2).toBeCloseTo(cover.y + cover.height / 2, 1);
  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await popup.waitForLoadState();
  await expect(popup).toHaveURL(posts.items[0].video.pageUrl!);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  await expect(page).toHaveURL(`${baseUrl}post/index.html`);
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-08-05');
  await expect(page.locator('video, iframe, .image-viewer')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/video-cover'))).toEqual(['GET /post/video-cover?mblogId=local-1']);
});

test('video_retweets_deduplicate_only_the_same_playable_page_and_keep_pure_layout', async ({ page }) => {
  posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=local-1', pageUrl: 'https://video.example.test/same' };
  posts.items[0].retweeted = { screenName: '原作者', content: '转发视频', video: { coverUrl: '/post/video-cover?mblogId=local-1&retweeted=true', pageUrl: 'https://video.example.test/same' } };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('link', { name: '播放转发视频', exact: true })).toBeVisible();
  await expect(page.locator('.post-body > .post-video')).toHaveCount(0);
  await expect(page.locator('.post-retweet .post-video img')).toHaveAttribute('src', '/post/video-cover?mblogId=local-1&retweeted=true');
  expect(requests.filter(value => value.startsWith('GET /post/video-cover'))).toEqual(['GET /post/video-cover?mblogId=local-1&retweeted=true']);
  posts.items[0].retweeted.video!.pageUrl = 'https://video.example.test/different';
  await page.reload();
  await expect(page.locator('.post-video')).toHaveCount(2);
  posts.items[0].video = null;
  posts.items[0].content = '';
  await page.reload();
  await expect(page.locator('.pure-retweet')).toBeVisible();
  await expect(page.locator('.post-avatar')).toHaveCount(0);
  await expect(page.locator('.post-retweet .post-video')).toBeVisible();
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
});

test('failed_video_cover_keeps_a_visible_clickable_and_keyboard_accessible_placeholder', async ({ page, context }) => {
  posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=broken-video', pageUrl: 'https://video.example.test/fallback' };
  await context.route('https://video.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Video fixture</h1>' }));
  await page.goto(`${baseUrl}post/index.html`);
  const link = page.getByRole('link', { name: '播放微博视频', exact: true });
  await expect(link.locator('img[hidden]')).toHaveCount(1);
  await expect(link).toBeVisible();
  const rectangle = (await link.boundingBox())!;
  expect(rectangle.width).toBe(320);
  expect(rectangle.height).toBe(240);
  for (const method of ['click', 'Enter']) {
    const opened = page.waitForEvent('popup');
    if (method === 'click') await link.click();
    else { await link.focus(); await page.keyboard.press('Enter'); }
    const popup = await opened;
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(posts.items[0].video.pageUrl!);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
  }
  await expect(page.locator('.post-avatar')).toBeVisible();
  await expect(page).toHaveURL(`${baseUrl}post/index.html`);
});

test('video_cards_skip_incomplete_or_unsafe_sources_and_do_not_hide_a_valid_outer_video', async ({ page }) => {
  const invalid: (Video | null)[] = [null, {}, { pageUrl: 'https://video.example.test/only-page' },
    { coverUrl: '/post/video-cover?mblogId=local-1' },
    { pageUrl: 'javascript:window.videoAttack=1', coverUrl: '/post/video-cover?mblogId=local-1' },
    { pageUrl: 'https://video.example.test/valid', coverUrl: 'data:image/svg+xml,<svg onload="window.videoAttack=2"/>' },
    { pageUrl: 'file:///video', coverUrl: '/post/video-cover?mblogId=local-1' },
    { pageUrl: 'https://', coverUrl: '/post/video-cover?mblogId=local-1' },
    { pageUrl: 'https://video.example.test/valid', coverUrl: '/post/bloggers' }];
  for (const video of invalid) {
    posts.items[0].video = video;
    posts.items[0].retweeted = { screenName: '原作者', content: '原文', video };
    await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    await expect(page.locator('.post-video')).toHaveCount(0);
  }
  expect(requests.some(value => value.startsWith('GET /post/video-cover'))).toBe(false);
  expect(await page.evaluate(() => (window as Window & { videoAttack?: number }).videoAttack)).toBeUndefined();
  posts.items[0].video = { pageUrl: 'https://video.example.test/valid', coverUrl: `${process.env.API_PROXY_TARGET}/post/video-cover?mblogId=local-1` };
  posts.items[0].retweeted!.video = { pageUrl: 'https://video.example.test/valid', coverUrl: 'javascript:window.videoAttack=3' };
  await page.reload();
  await expect(page.getByRole('link', { name: '播放微博视频', exact: true })).toBeVisible();
  await expect(page.locator('.post-retweet .post-video')).toHaveCount(0);
});

test('video_and_image_cards_keep_their_own_interactions_and_reading_order', async ({ page }) => {
  posts.items[0].pics = [imageFixture('mixed')];
  posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=local-1', pageUrl: 'https://video.example.test/mixed' };
  await page.goto(`${baseUrl}post/index.html`);
  const image = page.getByRole('img', { name: '微博图片', exact: true });
  await expect(image).toBeVisible();
  const video = page.getByRole('link', { name: '播放微博视频', exact: true });
  await expect(video).toBeVisible();
  expect((await video.boundingBox())!.y).toBeGreaterThan((await image.boundingBox())!.y);
  await image.click();
  await expect(page.getByRole('dialog', { name: '查看原图' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(video).toBeVisible();
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
});

test('long_video_feed_loads_covers_on_demand_without_prefetching_video_pages', async ({ page }) => {
  let videoPageRequests = 0;
  page.on('request', request => { if (request.url().startsWith('https://video.example.test/')) videoPageRequests++; });
  posts.items = Array.from({ length: 40 }, (_, index) => ({ ...posts.items[0], mblogId: `video-${index}`,
    video: { coverUrl: `/post/video-cover?mblogId=video-${index}`, pageUrl: `https://video.example.test/${index}` } }));
  await page.goto(`${baseUrl}post/index.html`);
  const first = page.locator('.post-video img').first();
  const last = page.locator('.post-video img').last();
  await expect.poll(() => first.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  expect(requests.some(value => value.includes('mblogId=video-39'))).toBe(false);
  const date = page.getByRole('button', { name: '2026-08-05', exact: true });
  const dateTop = (await date.boundingBox())!.y;
  await last.scrollIntoViewIfNeeded();
  await expect.poll(() => last.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  expect(requests.some(value => value.includes('mblogId=video-39'))).toBe(true);
  expect(videoPageRequests).toBe(0);
  expect((await date.boundingBox())!.y).toBe(dateTop);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  test(`video_layout_preserves_media_dimensions_at_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=local-1', pageUrl: 'https://video.example.test/outer' };
    posts.items[0].retweeted = { screenName: '原作者', content: '转发视频', video: { coverUrl: '/post/video-cover?mblogId=local-1&retweeted=true', pageUrl: 'https://video.example.test/retweet' } };
    const measure = () => page.locator('.post-video, .post-video img, .post-video-play, .post-video-play span').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, border: style.borderStyle === 'none' ? 'none' : style.border, radius: style.borderRadius, background: style.background, objectFit: style.objectFit };
    }));
    const { legacy } = approvedGeometry[`video-${viewport.width}`];
  await page.goto(`${baseUrl}post/index.html`);
    await expect(page.locator('.post-video')).toHaveCount(2);
    await expect.poll(() => page.locator('.post-video img').last().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
    const actual = await measure();
    expect(actual.map(({ width, height, objectFit }) => ({ width, height, objectFit })))
      .toEqual(legacy.map(({ width, height, objectFit }: { width: number; height: number; objectFit: string }) => ({ width, height, objectFit })));
    expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator('.post-video-play span').first()).toHaveCSS('width', '48px');
    await expect(page.locator('.post-video img').first()).toHaveCSS('width', '320px');
    await page.screenshot({ path: testInfo.outputPath('video-react.png') });
  });
}

test('video_component_hot_updates_keep_the_open_image_viewer_and_document', async ({ page }) => {
  const component = new URL('../src/post/PostVideo.tsx', import.meta.url);
  const originalComponent = await readFile(component, 'utf8');
  posts.items[0].pics = [imageFixture('mixed')];
  posts.items[0].video = { coverUrl: '/post/video-cover?mblogId=local-1', pageUrl: 'https://video.example.test/mixed' };
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '查看微博图片 1', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  await expect(viewer).toBeVisible();
  await page.evaluate(() => Object.assign(window, { videoDocument: 'original' }));
  try {
    await writeFile(component, originalComponent.replace('播放微博视频', '播放视频热更新'));
    await expect(page.locator('.post-video')).toHaveAttribute('aria-label', '播放视频热更新');
    await expect(viewer).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { videoDocument?: string }).videoDocument)).toBe('original');
    await page.waitForLoadState('networkidle');
  } finally {
    await writeFile(component, originalComponent);
  }
  await expect(page.locator('.post-video')).toHaveAttribute('aria-label', '播放微博视频');
  await page.keyboard.press('Escape');
});

test('image_viewer_zooms_long_images_with_wheel_and_drags_without_closing', async ({ page }, testInfo) => {
  posts.items[0].pics = [imageFixture('long'), imageFixture('next')];
  await page.route(/\/post\/image\?.*pid=long.*variant=original/, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="12000"><defs><pattern id="text" width="300" height="120" patternUnits="userSpaceOnUse"><rect width="300" height="120" fill="white"/><text x="30" y="80" font-size="48">长图文字</text></pattern></defs><rect width="1800" height="12000" fill="url(#text)"/></svg>',
  }));
  await page.goto(`${baseUrl}post/index.html`);
  const trigger = page.getByRole('button', { name: '查看微博图片 1', exact: true });
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  const image = viewer.getByRole('img', { name: '微博原图' });
  await expect(image).toBeVisible();
  const initial = (await image.boundingBox())!;
  const pointer = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 4 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await image.boundingBox())!.height).toBeGreaterThan(initial.height * 1.5);
  const zoomed = (await image.boundingBox())!;
  expect((pointer.y - zoomed.y) / zoomed.height).toBeCloseTo(0.25, 2);
  await page.mouse.down();
  await page.mouse.move(pointer.x + 80, pointer.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect(viewer).toBeVisible();
  await expect.poll(async () => Math.round((await image.boundingBox())!.y - zoomed.y)).toBe(100);
  await page.mouse.wheel(0, -100000);
  await expect.poll(async () => (await image.boundingBox())!.height).toBeGreaterThanOrEqual(12000);
  await page.screenshot({ path: testInfo.outputPath('viewer-zoomed.png') });
  await page.mouse.wheel(0, 100000);
  await expect.poll(() => image.boundingBox()).toEqual(initial);
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await image.boundingBox())!.height).toBeGreaterThan(initial.height);
  await page.keyboard.press('ArrowRight');
  await expect(viewer.locator('.viewer-counter')).toHaveText('2 / 2');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => image.boundingBox()).toEqual(initial);
  await page.keyboard.press('Escape');
  await trigger.click();
  await expect.poll(() => image.boundingBox()).toEqual(initial);
});

test('image_viewer_opens_original_on_demand_and_escape_restores_the_picture_focus', async ({ page }) => {
  posts.items[0].pics = [imageFixture('single')];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('img', { name: '微博图片', exact: true })).toBeVisible();
  expect(requests.some(value => value.includes('variant=original'))).toBe(false);
  const picture = page.getByRole('button', { name: '查看微博图片 1', exact: true });
  await picture.focus();
  await page.keyboard.press('Enter');
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img', { name: '微博原图' })).toHaveAttribute('src', imageFixture('single').originalUrl!);
  await expect.poll(() => viewer.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(viewer.getByRole('button')).toHaveCount(0);
  await expect(viewer.locator('.viewer-counter')).toHaveCount(0);
  await viewer.locator('img').click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(picture).toBeFocused();
  await expect(page).toHaveURL(`${baseUrl}post/index.html`);
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('image_viewer_cycles_with_buttons_and_arrows_and_keeps_retweet_groups_separate', async ({ page }) => {
  posts.items[0].pics = [imageFixture('p1'), imageFixture('p2'), imageFixture('p3', { originalUrl: 'javascript:window.viewerAttack=1' })];
  posts.items[0].retweeted = { screenName: '原作者', content: '原文', pics: [imageFixture('r1'), imageFixture('r2')] };
  await page.goto(`${baseUrl}post/index.html`);
  const opener = page.getByRole('button', { name: '查看微博图片 2', exact: true });
  await opener.click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  const counter = viewer.locator('.viewer-counter');
  await expect(counter).toHaveText('2 / 3');
  await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('p2').originalUrl!);
  expect(requests.filter(value => value.includes('variant=original'))).toEqual(['GET ' + imageFixture('p2').originalUrl]);
  expect(await viewer.evaluate(element => element.matches(':modal'))).toBe(true);
  await page.locator('.all-bloggers').evaluate(element => (element as HTMLElement).focus());
  await expect.poll(() => viewer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => viewer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => viewer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await viewer.getByRole('button', { name: '下一张' }).click();
  await expect(counter).toHaveText('3 / 3');
  await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('p3').thumbnailUrl!);
  await viewer.getByRole('button', { name: '下一张' }).click();
  await expect(counter).toHaveText('1 / 3');
  await viewer.getByRole('button', { name: '上一张' }).click();
  await expect(counter).toHaveText('3 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText('2 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('3 / 3');
  expect(await page.evaluate(() => (window as Window & { viewerAttack?: number }).viewerAttack)).toBeUndefined();
  await viewer.click({ position: { x: 8, y: 8 } });
  await expect(viewer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.getByRole('button', { name: '查看转发微博图片 2', exact: true }).click();
  await expect(counter).toHaveText('2 / 2');
  await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('r2').originalUrl!);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`${baseUrl}post/index.html`);
});

test('image_viewer_isolates_late_failure_and_can_navigate_or_close_after_an_error', async ({ page }) => {
  posts.items[0].pics = [imageFixture('broken-original'), imageFixture('fast')];
  holdOriginalPid = 'broken-original';
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '查看微博图片 1', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  try {
    await expect(viewer.getByRole('status')).toHaveText('加载中…');
    await expect.poll(() => Boolean(releaseOriginal)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
    releaseOriginal?.();
    await expect(viewer.getByRole('status')).toHaveText('');
    await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('fast').originalUrl!);
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByRole('status')).toHaveText('加载中…');
    await expect.poll(() => Boolean(releaseOriginal)).toBe(true);
    releaseOriginal?.();
    await expect(viewer.getByRole('status')).toHaveText('图片加载失败');
    await expect(viewer.getByRole('img', { name: '微博原图' })).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
    await page.keyboard.press('Escape');
    holdOriginalPid = undefined;
    await page.getByRole('button', { name: '查看微博图片 1', exact: true }).click();
    await expect(viewer.getByRole('status')).toHaveText('图片加载失败');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  } finally {
    holdOriginalPid = undefined;
    releaseOriginal?.();
  }
});

test('image_viewer_closes_pending_loads_and_unmounts_without_leaving_a_modal', async ({ page }) => {
  const component = new URL('../src/post/PostPage.tsx', import.meta.url);
  const originalComponent = await readFile(component, 'utf8');
  posts.items[0].pics = [imageFixture('slow'), imageFixture('fast')];
  holdOriginalPid = 'slow';
  await page.goto(`${baseUrl}post/index.html`);
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  const opener = page.getByRole('button', { name: '查看微博图片 1', exact: true });
  try {
    await opener.click();
    await expect(viewer.getByRole('status')).toHaveText('加载中…');
    await expect.poll(() => Boolean(releaseOriginal)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();
    releaseOriginal?.();
    holdOriginalPid = undefined;
    await page.getByRole('button', { name: '查看微博图片 2', exact: true }).click();
    await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
    await writeFile(component, "export default function PostPage() { return <h1>图片阅读已退出</h1>; }");
    await expect(page.getByRole('heading', { name: '图片阅读已退出' })).toBeVisible();
    expect(await page.locator('dialog:modal').count()).toBe(0);
    await page.keyboard.press('ArrowRight');
    await page.waitForLoadState('networkidle');
  } finally {
    holdOriginalPid = undefined;
    releaseOriginal?.();
    await writeFile(component, originalComponent);
  }
  await expect(page.getByRole('img', { name: '微博图片', exact: true })).toHaveCount(2);
  await expect(viewer).toHaveCount(0);
  const before = requests.filter(value => value.includes('variant=original')).length;
  await page.keyboard.press('ArrowRight');
  expect(requests.filter(value => value.includes('variant=original'))).toHaveLength(before);
  await opener.focus();
  await page.keyboard.press('Space');
  await expect(viewer.locator('.viewer-counter')).toHaveText('1 / 2');
  await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('slow').originalUrl!);
  await page.keyboard.press('Escape');
});

test('image_viewer_late_success_cannot_replace_the_current_picture', async ({ page }) => {
  posts.items[0].pics = [imageFixture('slow'), imageFixture('fast')];
  holdOriginalPid = 'slow';
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '查看微博图片 1', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  try {
    await expect.poll(() => Boolean(releaseOriginal)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
    releaseOriginal?.();
    await expect(viewer.getByRole('status')).toHaveText('');
    await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('fast').originalUrl!);
    holdOriginalPid = undefined;
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
    await expect(viewer.locator('img')).toHaveAttribute('src', imageFixture('slow').originalUrl!);
    await page.keyboard.press('Escape');
  } finally {
    holdOriginalPid = undefined;
    releaseOriginal?.();
  }
});

test('image_viewer_keeps_duplicate_and_hidden_entries_in_gallery_order', async ({ page }) => {
  posts.items[0].pics = [imageFixture('broken'), imageFixture('same'), imageFixture('same')];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-pic[hidden]')).toHaveCount(1);
  await page.getByRole('button', { name: '查看微博图片 3', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  await expect(viewer.locator('.viewer-counter')).toHaveText('3 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByRole('status')).toHaveText('图片加载失败');
  await expect(viewer.locator('.viewer-counter')).toHaveText('1 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.locator('.viewer-counter')).toHaveText('2 / 3');
  await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
  await page.keyboard.press('Escape');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 900, height: 560 }]) {
  test(`image_viewer_preserves_fullscreen_geometry_at_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    posts.items[0].pics = [imageFixture('v1'), imageFixture('v2')];
    const measure = () => page.locator('.image-viewer, .image-viewer img, .viewer-prev, .viewer-next, .viewer-counter').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, border: style.borderStyle === 'none' ? 'none' : style.border, background: style.background, font: style.font, objectFit: style.objectFit, shadow: style.boxShadow };
    }));
    const { legacy } = approvedGeometry[`viewer-${viewport.width}`];
  await page.goto(`${baseUrl}post/index.html`);
    await page.getByRole('button', { name: '查看微博图片 2', exact: true }).click();
    await expect(page.locator('.image-viewer img')).toBeVisible();
    const actual = await measure();
    expect(actual.map(({ x, y, width, height, objectFit }) => ({ x, y, width, height, objectFit })))
      .toEqual(legacy.map(({ x, y, width, height, objectFit }: { x: number; y: number; width: number; height: number; objectFit: string }) => ({ x, y, width, height, objectFit })));
    expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('viewer-react.png') });
    await page.keyboard.press('Escape');
  });
}

test('single_post_image_preserves_ratio_and_uses_known_fallback_dimensions', async ({ page }) => {
  posts.items[0].pics = [imageFixture('single', { thumbnailWidth: 0, thumbnailHeight: 0, originalWidth: 300, originalHeight: 180 })];
  await page.goto(`${baseUrl}post/index.html`);
  const image = page.getByRole('img', { name: '微博图片', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(page.locator('.post-pics.one-image')).toHaveCSS('grid-template-columns', '320px');
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(image).toHaveCSS('max-height', '320px');
  await expect(image).toHaveAttribute('width', '300');
  await expect(image).toHaveAttribute('height', '180');
  const rect = (await image.boundingBox())!;
  expect(rect.width / rect.height).toBeCloseTo(300 / 180, 2);
});

test('retweet_images_follow_original_text_and_keep_the_small_grid_for_pure_retweets', async ({ page }, testInfo) => {
  posts.items[0].content = '';
  posts.items[0].retweeted = { screenName: '原作者', content: '转发原文', pics: [imageFixture('r1'), imageFixture('r2')] };
  await page.goto(`${baseUrl}post/index.html`);
  const images = page.getByRole('img', { name: '转发微博图片', exact: true });
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.first().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('width', '100px');
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('height', '100px');
  await expect(page.locator('.post-retweet-pics')).toHaveCSS('gap', '4px');
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('background-color', 'rgb(7, 43, 66)');
  await expect(images.first()).not.toHaveAttribute('width');
  await expect(page.locator('.post-card.pure-retweet')).toBeVisible();
  await expect(page.locator('.post-avatar')).toHaveCount(0);
  const text = (await page.locator('.post-retweet-content').boundingBox())!;
  expect((await images.first().boundingBox())!.y).toBeGreaterThan(text.y + text.height);
  await page.screenshot({ path: testInfo.outputPath('pure-retweet-images.png') });
  posts.items[0].content = '外层评论';
  posts.items[0].pics = [imageFixture('outer')];
  posts.items[0].retweeted.pics = [imageFixture('r1')];
  await page.reload();
  await expect(page.getByRole('img', { name: '微博图片', exact: true })).toHaveCount(1);
  await expect(images).toHaveCount(1);
  await expect(page.locator('.post-retweet-pic')).toHaveCSS('width', '100px');
  await expect(page.locator('.post-avatar')).toBeVisible();
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
});

test('failed_and_unsafe_images_do_not_break_other_images_or_pure_retweet_classification', async ({ page }) => {
  const invalid = [imageFixture('missing', { thumbnailUrl: null, originalUrl: null }),
    imageFixture('unsafe', { thumbnailUrl: 'javascript:window.imageAttack=1', originalUrl: 'data:image/svg+xml,<svg onload="window.imageAttack=2"/>' }),
    imageFixture('other-endpoint', { thumbnailUrl: '/post/bloggers', originalUrl: null })];
  posts.items[0].content = '';
  posts.items[0].pics = [imageFixture('broken'), imageFixture('good'), imageFixture('good'), ...invalid,
    imageFixture('fallback', { thumbnailUrl: 'javascript:window.imageAttack=3', originalUrl: `${process.env.API_PROXY_TARGET}/post/image?mblogId=local-1&pid=fallback&variant=original` })];
  posts.items[0].retweeted = { screenName: '原作者', content: '原文仍可读', pics: [imageFixture('broken'), imageFixture('good'), ...invalid] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-pic[hidden]')).toHaveCount(1);
  await expect(page.locator('.post-retweet-pic[hidden]')).toHaveCount(1);
  await expect(page.locator('.post-pic[hidden]')).toHaveCSS('display', 'none');
  await expect(page.getByRole('img', { name: '微博图片', exact: true })).toHaveCount(3);
  await expect(page.getByRole('img', { name: '转发微博图片', exact: true })).toHaveCount(1);
  await expect(page.locator('.post-retweet-content')).toHaveText('原文仍可读');
  await expect(page.locator('.post-avatar')).toBeVisible();
  await expect(page.locator('.pure-retweet')).toHaveCount(0);
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
  expect(await page.evaluate(() => (window as Window & { imageAttack?: number }).imageAttack)).toBeUndefined();
  expect(requests.filter(value => value.startsWith('GET /post/image') && value.includes('pid=broken'))).toHaveLength(1);
  await page.getByRole('button', { name: '全部博主', exact: true }).click();
  await expect(page.locator('.post-retweet-content')).toHaveText('原文仍可读');
  await expect(page.locator('.post-pic[hidden]')).toHaveCount(1);
  posts.items[0].pics = invalid;
  posts.items[0].retweeted.pics = null;
  await page.reload();
  await expect(page.locator('.post-avatar')).toBeVisible();
  await expect(page.locator('.post-pics, .post-retweet-pics')).toHaveCount(0);
  posts.items[0].pics = null;
  await page.reload();
  await expect(page.locator('.pure-retweet')).toBeVisible();
  await expect(page.locator('.post-retweet-content')).toHaveText('原文仍可读');
});

test('long_image_feed_loads_thumbnails_as_it_scrolls_without_moving_navigation', async ({ page }) => {
  posts.items = Array.from({ length: 40 }, (_, index) => ({ ...posts.items[0], mblogId: `lazy-${index}`, pics: [imageFixture(`lazy-${index}`)] }));
  await page.goto(`${baseUrl}post/index.html`);
  const first = page.getByRole('img', { name: '微博图片', exact: true }).first();
  const last = page.getByRole('img', { name: '微博图片', exact: true }).last();
  await expect.poll(() => first.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  expect(requests.some(value => value.includes('pid=lazy-39'))).toBe(false);
  const date = page.getByRole('button', { name: '2026-08-05', exact: true });
  const dateTop = (await date.boundingBox())!.y;
  await last.scrollIntoViewIfNeeded();
  await expect.poll(() => last.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  expect(requests.some(value => value.includes('pid=lazy-39'))).toBe(true);
  expect(requests.some(value => value.includes('variant=original'))).toBe(false);
  expect((await date.boundingBox())!.y).toBe(dateTop);
  expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await last.click();
  const viewer = page.getByRole('dialog', { name: '查看原图', exact: true });
  await expect(viewer.getByRole('img', { name: '微博原图' })).toBeVisible();
  const readingPosition = await page.locator('.posts').evaluate(element => element.scrollTop);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '查看微博图片 1', exact: true }).last()).toBeFocused();
  expect(await page.locator('.posts').evaluate(element => element.scrollTop)).toBe(readingPosition);
  expect((await date.boundingBox())!.y).toBe(dateTop);
});

for (const mode of ['single', 'multiple', 'retweet'] as const) {
  test(`image_layout_preserves_media_dimensions_${mode}`, async ({ page }, testInfo) => {
    const pics = [imageFixture('same-1'), imageFixture('same-2'), imageFixture('same-3'), imageFixture('same-4')];
    if (mode === 'retweet') {
      posts.items[0].content = '';
      posts.items[0].retweeted = { screenName: '原作者', content: '图片之前的原文', pics };
    } else posts.items[0].pics = mode === 'single' ? pics.slice(0, 1) : pics;
    await page.goto(`${baseUrl}post/index.html`);
    await expect.poll(() => page.locator('article img').last().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
    for (const tile of await page.locator('.post-pic, .post-retweet-pic').all()) {
      const rect = (await tile.boundingBox())!;
      if (mode === 'single') expect(rect.width / rect.height).toBeCloseTo(300 / 180, 1);
      else {
        expect(rect.width).toBe(mode === 'retweet' ? 100 : 120);
        expect(rect.height).toBe(rect.width);
      }
    }
    expect(await page.locator('.posts').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('react-images.png') });
  });
}

test('inline_picture_links_open_through_proxy_when_cdn_rejects_browser_navigation', async ({ page, context }) => {
  const outer = 'https://wx3.sinaimg.cn/large/outer.jpg?size=large&key=a%2Bb';
  const retweeted = 'https://wx4.sinaimg.cn/large/retweeted.jpg';
  posts.items[0].content = `<a href="${outer.replaceAll('&', '&amp;')}" data-pid="outer">查看图片</a>`;
  posts.items[0].retweeted = { screenName: '原作者', content: '<a href="//wx4.sinaimg.cn/large/retweeted.jpg" data-pid="retweeted">查看图片</a>' };
  const directReads: string[] = [];
  await context.route('https://*.sinaimg.cn/**', route => {
    directReads.push(route.request().url());
    return route.fulfill({ status: 403, contentType: 'text/html', body: '<h1>403 Forbidden</h1>' });
  });
  await page.goto(`${baseUrl}post/index.html`);
  for (const [selector, url] of [['.post-content', outer], ['.post-retweet-content', retweeted]]) {
    const link = page.locator(selector).getByRole('link', { name: '查看图片' });
    const proxyPath = `/chat/image?${new URLSearchParams({ url })}`;
    await expect(link).toHaveAttribute('href', proxyPath);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    await link.focus();
    const opening = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await opening;
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(`${baseUrl.slice(0, -1)}${proxyPath}`);
    await expect.poll(() => popup.locator('svg').evaluateAll(images => images.length)).toBe(1);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await expect(page).toHaveURL(`${baseUrl}post/index.html`);
    await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveAttribute('aria-label', '2026-08-05');
  }
  expect(directReads).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /chat/image'))).toEqual([outer, retweeted].map(url => `GET /chat/image?${new URLSearchParams({ url })}`));
});

test('inline_picture_proxy_leaves_ordinary_links_and_unsafe_addresses_to_existing_sanitization', async ({ page }) => {
  posts.items[0].content = '<a href="https://example.test/page" data-pid="ordinary">网页</a>'
    + '<a href="https://wx3.sinaimg.cn.evil.test/large/fake.jpg" data-pid="fake">相似域名</a>'
    + '<a href="https://wx3.sinaimg.cn/large/plain.jpg">普通图片链接</a>'
    + '<a href="/n/用户" data-pid="mention">用户</a>'
    + '<a href="javascript:window.pictureAttack=1" data-pid="unsafe">恶意地址</a>';
  await page.goto(`${baseUrl}post/index.html`);
  const content = page.locator('.post-content');
  await expect(content.getByRole('link', { name: '网页', exact: true })).toHaveAttribute('href', 'https://example.test/page');
  await expect(content.getByRole('link', { name: '相似域名' })).toHaveAttribute('href', 'https://wx3.sinaimg.cn.evil.test/large/fake.jpg');
  await expect(content.getByRole('link', { name: '普通图片链接' })).toHaveAttribute('href', 'https://wx3.sinaimg.cn/large/plain.jpg');
  await expect(content.getByRole('link', { name: '用户', exact: true })).toHaveAttribute('href', 'https://weibo.com/n/用户');
  await expect(content.locator('[data-pid="unsafe"]')).not.toHaveAttribute('href');
  expect(requests.filter(value => value.startsWith('GET /chat/image'))).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { pictureAttack?: number }).pictureAttack)).toBeUndefined();
});

test('avatars_and_verified_names_use_existing_fields_and_fall_back_safely', async ({ page }) => {
  const directReads: string[] = [];
  await page.route('https://avatar.test/**', route => {
    directReads.push(route.request().url());
    return route.fulfill({ status: 403, contentType: 'text/html', body: 'Forbidden' });
  });
  bloggers[0] = { uid: 1, screenName: '第一位', avatar: 'https://avatar.test/valid.svg?size=48&variant=small', verified: true };
  posts.items[0].blogger = bloggers[0];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-avatar img')).toBeVisible();
  await expect.poll(() => page.locator('.post-avatar img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(48);
  await expect(page.locator('.blogger-list .blogger-avatar img')).toHaveAttribute('src', `/chat/image?${new URLSearchParams({ url: bloggers[0].avatar! })}`);
  expect(directReads).toEqual([]);
  await expect(page.locator('.post-author').getByRole('img', { name: '已认证' })).toBeVisible();
  await expect(page.locator('.blogger-name').getByRole('img', { name: '已认证' })).toBeVisible();
  await expect(page.locator('.blogger-list .blogger-avatar').last()).toHaveText('第');
  await expect(page.locator('.blogger-list .blogger-avatar').last()).toHaveCSS('font-size', '18px');
  await expect(page.locator('.blogger-list .blogger-avatar').last()).toHaveCSS('line-height', '18px');
  for (const avatar of ['https://avatar.test/broken.svg', 'javascript:window.avatarAttack=1', 'not a URL']) {
    bloggers[0].avatar = avatar;
    await page.reload();
    await expect(page.locator('.post-avatar')).toHaveText('第');
    await expect(page.locator('.post-avatar img')).toHaveCount(0);
    await expect(page.locator('.blogger-list .blogger-avatar').first()).toHaveText('第');
  }
  expect(await page.evaluate(() => (window as Window & { avatarAttack?: number }).avatarAttack)).toBeUndefined();
  posts.items[0].blogger = null;
  await page.reload();
  await expect(page.locator('.post-avatar')).toHaveText('?');
  await expect(page.locator('.post-author')).toHaveText('未知博主');
});

test('pure_retweet_layout_waits_for_absence_of_outer_media', async ({ page }) => {
  posts.items[0].content = '';
  posts.items[0].retweeted = { screenName: '原作者', content: '原文' };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-card.pure-retweet')).toBeVisible();
  await expect(page.locator('.post-avatar')).toHaveCount(0);
  posts.items[0].pics = [{ pid: 'unavailable' }];
  await page.reload();
  await expect(page.locator('.post-avatar')).toBeVisible();
  await expect(page.locator('.pure-retweet')).toHaveCount(0);
  posts.items[0].pics = [];
  posts.items[0].video = { pageUrl: 'https://example.com/video', coverUrl: 'https://example.com/cover' };
  await page.reload();
  await expect(page.locator('.post-avatar')).toBeVisible();
  posts.items[0].video.coverUrl = null;
  await page.reload();
  await expect(page.locator('.pure-retweet')).toBeVisible();
  await expect(page.locator('.post-avatar')).toHaveCount(0);
});

test('minimum_desktop_keeps_feed_header_fixed_and_sidebar_navigation_reachable', async ({ page }, testInfo) => {

  await page.setViewportSize({ width: 900, height: 560 });
  bloggers = Array.from({ length: 40 }, (_, i) => ({ uid: i + 1, screenName: `博主 ${i + 1}` }));
  posts.items[0].content = '长正文\n'.repeat(80);
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toBeVisible();
  const headerTop = (await page.locator('.feed-header').boundingBox())!.y;
  await page.locator('.posts').hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.locator('.posts').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.feed-header').boundingBox())!.y).toBe(headerTop);
  await page.getByRole('button', { name: '添加博主', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '添加博主', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '博主 40', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '博主 40', exact: true })).toBeInViewport();
  const year = page.getByLabel('选择年份', { exact: true });
  await year.focus();
  await expect(year).toHaveCSS('outline-width', '3px');
  await expect(year).toHaveCSS('outline-offset', '2px');
  await expect(year).toBeInViewport();
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  await page.screenshot({ path: testInfo.outputPath('minimum-desktop.png') });
});

test('default_reading_uses_latest_valid_day_shanghai_bounds_and_backend_total', async ({ page }) => {
  calendar.months = [
    { month: '2026-09', count: 0, days: [{ date: '2026-09-31', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] },
  ];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await expect(page.getByRole('button', { name: '全部博主', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
  await expect(page.getByLabel('博文总数')).toHaveCSS('font-size', '12px');
  await expect(page.getByLabel('博文总数')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await expect(page.getByRole('article')).toContainText('2026-08-05 08:30');
  await expect(page.locator('.post-content')).toHaveCSS('white-space', 'pre-wrap');
  const query = new URL(requests.find(value => value.startsWith('GET /post/list'))!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: '1', size: '9999', start: '2026-08-05 00:00:00', end: '2026-08-05 23:59:59' });
});

test('retweet_text_keeps_outer_comment_and_reads_original_author_and_safe_links', async ({ page }, testInfo) => {
  posts.items[0].content = '外层评论 https://outer.example.com.';
  posts.items[0].retweeted = { screenName: '原作者', content: '<b>原文第一行</b>\n第二行<br>第三行 https://example.com. //@原文用户: 文本' };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByLabel('博文总数')).toHaveText('共 3 条');
  await expect(page.locator('.post-content')).toHaveText('外层评论 https://outer.example.com.');
  const original = page.getByRole('complementary', { name: '转发正文', exact: true });
  await expect(original).toContainText('@原作者');
  await expect(original).toContainText('原文第一行');
  await expect(original.getByRole('link', { name: 'https://example.com' })).toHaveAttribute('href', 'https://example.com');
  await expect(original.getByRole('link', { name: '@原文用户' })).toHaveAttribute('href', 'https://weibo.com/n/原文用户');
  for (const link of [page.locator('.post-content').getByRole('link'), original.getByRole('link', { name: 'https://example.com' })]) {
    await page.mouse.move(0, 0);
    await expect(link).toHaveCSS('text-decoration-line', 'none');
    await link.hover();
    await expect(link).toHaveCSS('text-decoration-line', 'underline');
    await expect(link).toHaveCSS('text-decoration-style', 'solid');
  }
  await page.mouse.move(0, 0);
  await expect(original.locator('.post-retweet-content')).toHaveCSS('white-space', 'pre-wrap');
  await expect(page.locator('.post-content')).toHaveCSS('font-size', '15px');
  await expect(page.locator('.post-content')).toHaveCSS('line-height', '24px');
  await expect(original.locator('.post-retweet-content')).toHaveCSS('font-size', '14px');
  await expect(original.locator('.post-retweet-content')).toHaveCSS('line-height', '24px');
  const bodyFont = 'QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
  await expect(page.locator('.post-content')).toHaveCSS('font-family', bodyFont);
  await expect(original.locator('.post-retweet-content')).toHaveCSS('font-family', bodyFont);
  await expect(page.locator('.post-author')).toHaveCSS('font-family', '"Microsoft YaHei", sans-serif');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  expect(requests.filter(value => value !== 'GET /weibo/login/status').map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
  await page.screenshot({ path: testInfo.outputPath('retweet-reading.png') });
});

test('pure_retweet_omits_empty_outer_body_and_handles_missing_original_information', async ({ page }) => {
  posts.items[0].content = '';
  posts.items[0].retweeted = { screenName: null, content: '纯转发原文' };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-retweet')).toContainText('纯转发原文');
  await expect(page.locator('.post-retweet-author')).toHaveText('@未知用户');
  await expect(page.locator('.post-content')).toHaveCount(0);
  await expect(page.locator('.post-header')).toContainText('第一位');
  await expect(page.locator('.post-meta time')).toHaveText('2026-08-05 08:30');
  posts.items[0].retweeted = { screenName: '', content: null };
  await page.reload();
  await expect(page.locator('.post-retweet-author')).toHaveText('@未知用户');
  await expect(page.locator('.post-retweet-content')).toHaveText('');
  await expect(page.getByRole('article')).not.toContainText('原帖已删除');
  posts.items[0].content = '普通正文';
  posts.items[0].retweeted = null;
  await page.reload();
  await expect(page.locator('.post-content')).toHaveText('普通正文');
  await expect(page.locator('.post-retweet')).toHaveCount(0);
});

test('retweet_body_blocks_executable_markup_and_author_name_stays_literal_text', async ({ page }) => {
  const author = '<img src=x onerror="window.retweetAttack=8">';
  posts.items[0].retweeted = { screenName: author, content: '<script>window.retweetAttack=1</script><svg onload="window.retweetAttack=2"></svg><a href="javascript:window.retweetAttack=3">危险链接</a><iframe srcdoc="<script>parent.retweetAttack=4</script>"></iframe><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="window.retweetAttack=5"><b>安全原文</b>' };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-retweet-author')).toHaveText(`@${author}`);
  await expect(page.locator('.post-retweet-author img')).toHaveCount(0);
  const original = page.locator('.post-retweet-content');
  await expect(original).toContainText('安全原文');
  await expect(original.locator('script, svg, iframe, [onload], [onerror], a[href^="javascript:"]')).toHaveCount(0);
  await original.locator('img').evaluate(element => element.dispatchEvent(new Event('error')));
  expect(await page.evaluate(() => (window as Window & { retweetAttack?: number }).retweetAttack)).toBeUndefined();
});

test('retweet_sanitizer_failure_uses_plain_text_and_keeps_navigation', async ({ page }) => {
  const raw = 'inner-marker &lt;img src=x onerror="window.retweetAttack=1"&gt;<b>降级原文</b>';
  posts.items[0].retweeted = { screenName: '原作者', content: raw };
  await page.addInitScript(() => {
    DOMParser.prototype.parseFromString = function() { throw new Error('Text parser unavailable'); };
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-retweet-content')).toHaveText(raw);
  await expect(page.locator('.post-retweet-content img, .post-retweet-content b')).toHaveCount(0);
  await expect(page.locator('.post-content')).toHaveText(posts.items[0].content);
  await expect(page.locator('.post-content br')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { retweetAttack?: number }).retweetAttack)).toBeUndefined();
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.post-retweet-content')).toHaveText(raw);
});

test('date_navigation_selects_year_and_month_and_reads_the_clicked_day', async ({ page }, testInfo) => {
  calendar.months = [
    { month: '2025-12', count: 1, days: [{ date: '2025-12-31', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2026-08', count: 3, days: [{ date: '2026-08-04', count: 1 }, { date: '2026-08-05', count: 2 }] },
  ];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await expect(page.getByLabel('选择年份', { exact: true })).toHaveValue('2026');
  await expect(page.getByLabel('选择月份', { exact: true })).toHaveValue('08');
  await expect(page.getByRole('button', { name: '2026-08-05', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const beforeToggle = requests.slice();
  await page.getByLabel('选择年份', { exact: true }).selectOption('2025');
  await page.getByLabel('选择月份', { exact: true }).selectOption('12');
  await expect(page.getByRole('button', { name: '2025-12-31', exact: true })).toBeVisible();
  expect(requests).toEqual(beforeToggle);
  posts.items[0].content = '较早日期正文';
  posts.items[0].createdAt = Date.parse('2025-12-31T00:30:00Z');
  await page.getByRole('button', { name: '2025-12-31', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('较早日期正文');
  await expect(page.locator('.date-item[aria-label=\"2025-12-31\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('选择年份', { exact: true })).toHaveValue('2025');
  const query = new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: '1', size: '9999', start: '2025-12-31 00:00:00', end: '2025-12-31 23:59:59' });
  await page.screenshot({ path: testInfo.outputPath('date-navigation.png') });
});

test('blogger_selection_resets_to_latest_day_and_returning_to_all_reloads_its_scope', async ({ page }) => {
  calendarsByUid['1'] = { months: [{ month: '2026-07', count: 2, days: [{ date: '2026-07-10', count: 1 }, { date: '2026-07-09', count: 1 }] }] };
  postsByUid['1'] = { ...posts, items: [{ ...posts.items[0], content: '单博主正文' }], total: 1 };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toContainText('第一行');
  await page.getByRole('button', { name: '第一位', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '第一位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '第一位的微博', exact: true })).toBeVisible();
  await expect(page.locator('.date-item[aria-label=\"2026-07-10\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toContainText('单博主正文');
  await expect(page.getByRole('button', { name: '第一位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const singleQuery = new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(singleQuery)).toEqual({ page: '1', size: '9999', start: '2026-07-10 00:00:00', end: '2026-07-10 23:59:59', uids: '1' });
  expect(requests).toContain('GET /post/calendar?uid=1');
  await page.getByRole('button', { name: '2026-07-09', exact: true }).click();
  await expect(page.locator('.date-item[aria-label=\"2026-07-09\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toBeVisible();
  const beforeRepeat = requests.length;
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.locator('.date-item[aria-label=\"2026-07-10\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.slice(beforeRepeat).map(value => value.split('?')[0])).toEqual(['GET /post/calendar', 'GET /post/list']);
  await page.getByRole('button', { name: '全部博主', exact: true }).click();
  await expect(page.getByRole('button', { name: '全部博主', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toContainText('第一行');
  expect(new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams.has('uids')).toBe(false);
  expect(requests.filter(value => value.startsWith('GET /post/bloggers'))).toHaveLength(1);
});

test('inflight_day_read_keeps_selection_and_same_day_click_reads_again', async ({ page }) => {
  calendar.months[0].days.push({ date: '2026-08-04', count: 1 });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toBeVisible();
  const beforeReload = requests.length;
  holdResponse = true;
  holdPath = '/post/list';
  posts.items[0].content = '重新读取的正文';
  await page.getByRole('button', { name: '2026-08-05', exact: true }).click();
  try {
    await expect(page.getByRole('status')).toHaveText('正在加载博文……');
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.getByRole('button', { name: '2026-08-04', exact: true }).click();
    await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '2026-08-04', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(requests.slice(beforeReload)).toHaveLength(1);
  } finally {
    holdResponse = false;
    releaseResponse?.();
  }
  await expect(page.getByRole('article')).toContainText('重新读取的正文');
  await page.getByRole('button', { name: '2026-08-04', exact: true }).click();
  await expect(page.locator('.date-item[aria-label=\"2026-08-04\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toBeVisible();
});

test('long_feed_scrolls_independently_of_blogger_and_date_navigation', async ({ page }) => {
  posts.items = Array.from({ length: 24 }, (_, index) => ({ ...posts.items[0], mblogId: `scroll-${index}`, content: '用于滚动回归测试的长微博正文。'.repeat(100) }));
  posts.total = 24;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toHaveCount(24);
  const dateButton = page.getByRole('button', { name: '2026-08-05', exact: true });
  const dateTop = (await dateButton.boundingBox())!.y;
  const feed = page.locator('.posts');
  const feedHeight = (await feed.boundingBox())!.height;
  const scrollHeight = await feed.evaluate(element => element.scrollHeight);
  await feed.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => feed.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await dateButton.boundingBox())!.y).toBe(dateTop);
  expect((await feed.boundingBox())!.height).toBe(feedHeight);
  expect(await page.getByRole('region', { name: '博主区域', exact: true }).evaluate(element => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  const drift = await feed.evaluate(async (element, initialHeight) => {
    for (let frame = 0; frame < 200; frame++) {
      element.scrollTop += element.clientHeight;
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 1) break;
    }
    return { height: Math.abs(element.scrollHeight - initialHeight), remaining: element.scrollHeight - element.scrollTop - element.clientHeight };
  }, scrollHeight);
  expect(drift.remaining).toBeLessThanOrEqual(1);
  expect(drift.height).toBeLessThanOrEqual(1);
});

test('switching_blogger_cancels_old_calendar_and_ignores_its_late_error', async ({ page }) => {
  await page.addInitScript(() => {
    const fetchBefore = window.fetch;
    window.fetch = (input, init) => {
      if (String(input) === '/post/calendar?uid=1') {
        init?.signal?.addEventListener('abort', () => Object.assign(window, { oldCalendarAborted: true }));
      }
      return fetchBefore(input, init);
    };
  });
  calendarsByUid['2'] = { months: [{ month: '2025-12', count: 1, days: [{ date: '2025-12-31', count: 1 }] }] };
  postsByUid['2'] = { ...posts, items: [{ ...posts.items[0], content: '新范围正文', blogger: bloggers[1] }], total: 1 };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toBeVisible();
  holdResponse = true;
  holdPath = '/post/calendar';
  holdUid = '1';
  calendarStatus = 500;
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('正在加载日期……');
  await expect.poll(() => requests.includes('GET /post/calendar?uid=1')).toBe(true);
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByLabel('博文总数')).toHaveCount(0);
  calendarStatus = 200;
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  try {
    await expect(page.getByRole('article')).toContainText('新范围正文');
    await expect.poll(() => page.evaluate(() => (window as Window & { oldCalendarAborted?: boolean }).oldCalendarAborted)).toBe(true);
  } finally {
    holdResponse = false;
    releaseResponse?.();
  }
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.date-item[aria-label=\"2025-12-31\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('old_list_error_cannot_release_the_new_scope_loading_guard', async ({ page }) => {
  calendar.months[0].days.push({ date: '2026-08-04', count: 1 });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toBeVisible();
  holdResponse = true;
  holdPath = '/post/list';
  holdUid = '1';
  listStatus = 500;
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect.poll(() => requests.some(value => value.startsWith('GET /post/list') && value.includes('uids=1'))).toBe(true);
  let releaseOld = releaseResponse;
  holdUid = '2';
  listStatus = 200;
  postsByUid['2'] = { ...posts, items: [{ ...posts.items[0], content: '新博主加载完成', blogger: bloggers[1] }], total: 1 };
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect.poll(() => requests.some(value => value.startsWith('GET /post/list') && value.includes('uids=2'))).toBe(true);
  try {
    releaseOld?.();
    releaseOld = undefined;
    await expect(page.getByRole('status')).toHaveText('正在加载博文……');
    await expect(page.getByRole('alert')).toHaveCount(0);
    const beforeClick = requests.length;
    await page.getByRole('button', { name: '2026-08-04', exact: true }).click();
    await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
    expect(requests).toHaveLength(beforeClick);
  } finally {
    holdResponse = false;
    releaseOld?.();
    releaseResponse?.();
  }
  await expect(page.getByRole('article')).toContainText('新博主加载完成');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('empty_scope_and_calendar_failure_clear_old_feed_then_retry_preserves_new_scope', async ({ page }) => {
  calendarsByUid['1'] = { months: [] };
  postsByUid['2'] = { ...posts, items: [{ ...posts.items[0], content: '第二位重试正文', blogger: bloggers[1] }], total: 1 };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toBeVisible();
  await page.getByRole('button', { name: '第一位', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('暂无有博文的日期。');
  await expect(page.locator('.date-item[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByLabel('博文总数')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(requests.some(value => value.startsWith('GET /post/list') && value.includes('uids=1'))).toBe(false);
  calendarStatus = 500;
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本地读取暂时不可用');
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  calendarStatus = 200;
  listStatus = 500;
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('博文加载失败。（本地读取暂时不可用）');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  const beforeRetry = requests.length;
  listStatus = 200;
  await page.getByRole('button', { name: '重试博文' }).click();
  await expect(page.getByRole('article')).toContainText('第二位重试正文');
  expect(requests.slice(beforeRetry)).toHaveLength(1);
  expect(new URL(requests.at(-1)!.slice(4), 'http://fixture').searchParams.get('uids')).toBe('2');
});


test('zero_count_day_does_not_replace_latest_day_with_captured_content', async ({ page }) => {
  calendar.months.unshift({ month: '2060-01', count: 0, days: [{ date: '2060-01-01', count: 0 }] });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
});

test('rich_text_removes_executable_content_and_preserves_links_and_line_breaks', async ({ page }) => {
  posts.items[0].content = '<script>window.attack=1</script><svg onload="window.attack=2"></svg><a href="javascript:window.attack=3">危险链接</a><iframe srcdoc="<script>parent.attack=4</script>"></iframe><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="window.attack=5"><b>正常正文</b>\n第二行<br>第三行 https://example.com/A_(B). //@测试用户: 文本 <a href="/n/现有用户">现有用户</a> <a href="//weibo.com/u/1">主页</a>';
  await page.goto(`${baseUrl}post/index.html`);
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
  const emoji = await content.locator('img').boundingBox();
  const fontSize = await content.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(emoji!.width).toBeCloseTo(fontSize * 1.3, 1);
  expect(emoji!.height).toBeCloseTo(fontSize * 1.3, 1);
});

test('sanitizer_failure_renders_escaped_text_without_reinterpreting_markup', async ({ page }) => {
  posts.items[0].content = 'fallback-marker &lt;img src=x onerror="window.attack=1"&gt;<b>安全降级</b>';
  await page.addInitScript(() => {
    DOMParser.prototype.parseFromString = function() { throw new Error('Sanitizer unavailable'); };
  });
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-content')).toHaveText(posts.items[0].content);
  await expect(page.locator('.post-content img, .post-content b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { attack?: number }).attack)).toBeUndefined();
});

test('calendar_empty_and_day_empty_are_distinct_reading_states', async ({ page }) => {
  calendar = { months: [] };
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('status')).toHaveText('暂无有博文的日期。');
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers', 'GET /post/calendar']);
  calendar = { months: [{ month: '2026-08', count: 1, days: [{ date: '2026-08-05', count: 1 }] }] };
  posts.items = [];
  posts.total = 0;
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('该日无微博。');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('博文总数')).toHaveText('共 0 条');
});

test('calendar_error_retains_loaded_bloggers_and_backend_message', async ({ page }) => {
  calendarStatus = 500;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('日期加载失败，请刷新页面重试。（本地读取暂时不可用）');
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers', 'GET /post/calendar']);
});

test('list_retry_only_recovers_list_and_keeps_blogger_and_date_regions', async ({ page }) => {
  listStatus = 500;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('博文加载失败。（本地读取暂时不可用）');
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
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
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('status')).toHaveText('正在加载博文……');
  await page.goto(`${baseUrl}chat/index.html`);
  releaseResponse?.();
  holdResponse = false;
  posts.items[0].content = '新请求正文';
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('article')).toContainText('新请求正文');
  await expect(page.getByRole('article')).not.toContainText('旧请求正文');
  const completed = requests.slice();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
  await page.clock.runFor(65000);
  await expect(page.getByRole('article')).toContainText('新请求正文');
  expect(requests).toEqual(completed);
});

test('component_unmount_aborts_its_inflight_http_query_and_remount_loads_fresh_data', async ({ page }) => {
  const component = new URL('../src/post/PostPage.tsx', import.meta.url);
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
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('status')).toHaveText('正在加载博文……');
  try {
    await writeFile(component, "export default function PostPage() { return <h1>阅读已退出</h1>; }");
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
  await page.goto(`${baseUrl}post/index.html`);
  try {
    await expect(page.getByRole('status')).toHaveText('正在加载博主……');
  } finally {
    releaseResponse?.();
  }
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('post_displays_names_from_proxied_query', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.filter(value => value !== 'GET /weibo/login/status').map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
  await page.screenshot({ path: testInfo.outputPath('post.png') });
});

test('post_explains_empty_blogger_list', async ({ page }) => {
  bloggers = [];
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('status')).toHaveText('暂无博主。');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers']);
});

test('post_announces_query_failure', async ({ page }) => {
  status = 503;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('博主加载失败，请刷新页面重试。（HTTP 503）');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers']);
});

test('post_entry_refreshes_with_starry_skin', async ({ page }) => {
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(228, 238, 245)');
  await expect(page.locator('body')).toHaveCSS('background-image', /starry-sky/);
  await page.reload();
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  expect(requests.filter(value => value !== 'GET /weibo/login/status').map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list', 'GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
});

test('dev_proxy_preserves_html_modules_css_and_exact_api_paths', async ({ request }) => {
  for (const [path, mime] of [
    ['post/index.html', 'text/html'],
    ['chat/index.html', 'text/html'],
    ['src/post/main.tsx', 'javascript'],
    ['src/chat/main.tsx', 'javascript'],
    ['src/post/post.css?direct', 'text/css'],
    ['src/chat/chat.css?direct', 'text/css'],
  ]) {
    const response = await request.get(`${baseUrl}${path}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(mime);
  }
  for (const path of ['preview/post/index.html', 'post/bloggers.js', 'preview/chat/index.html', 'post/image-extra', 'post/image/module.js', 'post/video-cover-extra', 'post/video-cover/module.js', 'chat/image-extra', 'chat/image/module.js', 'chat/groups-extra', 'chat/attitudes-extra', 'chat/since-extra', 'chat/analyses-extra', 'chat/messages-extra', 'chat/messages/cursor/extra', 'chat/messages/send-extra', 'chat/media-extra']) {
    expect((await request.get(`${baseUrl}${path}`)).status()).toBe(404);
  }
  const response = await request.get(`${baseUrl}post/bloggers?probe=1`);
  expect(await response.json()).toEqual(bloggers);
  const image = await request.get(`${baseUrl}post/image?mblogId=local-1&pid=probe&variant=thumbnail`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/svg+xml');
  const cover = await request.get(`${baseUrl}post/video-cover?mblogId=local-1&retweeted=true`);
  expect(cover.status()).toBe(200);
  expect(cover.headers()['content-type']).toBe('image/svg+xml');
  const avatarQuery = new URLSearchParams({ url: 'https://avatar.test/valid.svg?size=48&variant=small' });
  const avatar = await request.get(`${baseUrl}chat/image?${avatarQuery}`);
  expect(avatar.status()).toBe(200);
  expect(avatar.headers()['content-type']).toBe('image/svg+xml');
  const chatGroups = await request.get(`${baseUrl}chat/groups?probe=1`);
  expect(chatGroups.status()).toBe(200);
  expect(await chatGroups.json()).toEqual([]);
  const chatCursor = await request.get(`${baseUrl}chat/messages/cursor?gid=1&size=50&probe=1`);
  expect(chatCursor.status()).toBe(200);
  expect(await chatCursor.json()).toEqual(bloggers);
  const chatMedia = await request.get(`${baseUrl}chat/media?gid=1&mid=1&variant=preview`);
  expect(chatMedia.status()).toBe(200);
  expect(requests.filter(value => value !== 'GET /weibo/login/status')).toEqual(['GET /post/bloggers?probe=1', 'GET /post/image?mblogId=local-1&pid=probe&variant=thumbnail', 'GET /post/video-cover?mblogId=local-1&retweeted=true', `GET /chat/image?${avatarQuery}`, 'GET /chat/groups?probe=1', 'GET /chat/messages/cursor?gid=1&size=50&probe=1', 'GET /chat/media?gid=1&mid=1&variant=preview']);
});

test('component_and_css_hot_updates_preserve_the_open_document', async ({ page }) => {
  const component = new URL('../src/post/PostPage.tsx', import.meta.url);
  const stylesheet = new URL('../src/post/post.css', import.meta.url);
  const originalComponent = await readFile(component, 'utf8');
  const originalStylesheet = await readFile(stylesheet, 'utf8');
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await page.evaluate(() => Object.assign(window, { previewDocument: 'original' }));
  try {
    await writeFile(component, originalComponent.replace('<h2>博主管理</h2>', '<h2>本地微博热更新验证</h2>'));
    await expect(page.getByRole('heading', { name: '本地微博热更新验证' })).toBeVisible();
    await writeFile(stylesheet, originalStylesheet.replace('700 19px/1.3', '700 17px/1.3'));
    await expect(page.getByRole('heading', { name: '本地微博热更新验证' })).toHaveCSS('font-size', '17px');
    expect(await page.evaluate(() => (window as Window & { previewDocument?: string }).previewDocument)).toBe('original');
  } finally {
    await writeFile(component, originalComponent);
    await writeFile(stylesheet, originalStylesheet);
  }
  await expect(page.getByRole('heading', { name: '博主管理', exact: true })).toBeVisible();
});
