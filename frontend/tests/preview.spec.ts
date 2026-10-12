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
let releaseResponse: (() => void) | undefined;
let status = 200;
let calendar = { months: [{ month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] }] };
let posts = { items: [{ mblogId: 'local-1', content: '第一行\n第二行<br>第三行', createdAt: Date.parse('2026-08-05T00:30:00Z'), blogger: { uid: 1, screenName: '第一位' } }], page: 1, size: 9999, total: 3 };
let pageErrors: string[];
let writeRequests: string[];

test.beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const send = () => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.url?.startsWith('/post/calendar') ? calendar : request.url?.startsWith('/post/list') ? posts : bloggers));
    };
    if (holdResponse) releaseResponse = send;
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
  releaseResponse = undefined;
  status = 200;
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
  await expect(page.getByRole('article')).toContainText('2026-08-05 08:30');
  await expect(page.locator('.post-content')).toHaveCSS('white-space', 'pre-wrap');
  const query = new URL(requests.find(value => value.startsWith('GET /post/list'))!.slice(4), 'http://fixture').searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: '1', size: '9999', start: '2026-08-05 00:00:00', end: '2026-08-05 23:59:59' });
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
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('post_displays_names_from_proxied_query', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  expect(requests).toEqual(['GET /post/bloggers']);
  await page.screenshot({ path: testInfo.outputPath('post.png') });
});

test('post_explains_empty_blogger_list', async ({ page }) => {
  bloggers = [];
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('status')).toHaveText('暂无博主。');
  await expect(page.getByRole('listitem')).toHaveCount(0);
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
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(43, 38, 32)');
  await expect(page.locator('body')).toHaveCSS('background-image', /radial-gradient/);
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveText(['第一位', '第二位']);
  expect(requests).toEqual(['GET /post/bloggers', 'GET /post/bloggers']);
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
