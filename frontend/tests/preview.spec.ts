import { createServer as createHttpServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Blogger, PostImage, PostList } from '../src/post/queries';

let backend: Server;
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
let holdUid: string | undefined;
let pageErrors: string[];
let writeRequests: string[];

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
    if (path === '/post/image') {
      response.writeHead(url.searchParams.get('pid') === 'broken' ? 404 : 200, { 'Content-Type': 'image/svg+xml' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#f9d27c"/></svg>');
      return;
    }
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

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  test(`post_visual_alignment_matches_legacy_reading_at_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route('**/legacy/**', async route => {
      const path = new URL(route.request().url()).pathname.slice('/legacy/'.length);
      const body = await readFile(new URL(`../../src/main/resources/static/${path}`, import.meta.url));
      await route.fulfill({ body, contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
    });
    const selectors = ['.titlebar', '.bloggers-heading', '.dates-heading', '.feed-header', '.year-header', '.month-header', '.date-item', '.blogger-row', '.post-card', '.post-avatar', '.post-header', '.post-content'];
    const measure = () => page.evaluate(selectors => selectors.map(selector => {
      const element = document.querySelector(selector)!;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.font, border: style.border, padding: style.padding, shadow: style.boxShadow };
    }), selectors);
    await page.goto(`${baseUrl}legacy/post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    const legacy = await measure();
    const legacyHighlight = await page.locator('.blogger-row.active').evaluate(element => getComputedStyle(element, '::before').transform);
    await page.screenshot({ path: testInfo.outputPath('legacy.png') });
    await page.goto(`${baseUrl}preview/post/index.html`);
    await expect(page.locator('.post-content')).toContainText('第一行');
    const react = await measure();
    for (let index = 0; index < selectors.length; index++) {
      const { y: oldY, height: oldHeight, ...oldStyle } = legacy[index];
      const { y: newY, height: newHeight, ...newStyle } = react[index];
      expect(newStyle, selectors[index]).toEqual(oldStyle);
      // Deferred search changes blogger position; post actions change card height.
      if (selectors[index] !== '.blogger-row') {
        expect(newY, selectors[index]).toBeCloseTo(oldY, 1);
        if (selectors[index] !== '.post-card') expect(newHeight, selectors[index]).toBeCloseTo(oldHeight, 1);
      }
    }
    expect(await page.locator('.blogger-row[aria-pressed="true"]').evaluate(element => getComputedStyle(element, '::before').transform)).toBe(legacyHighlight);
    await expect(page.locator('.feed-header').getByLabel('博文总数')).toHaveText('共 3 条');
    await expect(page.locator('.selected')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '正式 post 页面' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('react-aligned.png') });
  });
}

test('post_images_use_thumbnail_grid_and_original_fallback_without_opening_a_viewer', async ({ page }) => {
  posts.items[0].pics = [
    { pid: 'p1', thumbnailWidth: 300, thumbnailHeight: 180, originalWidth: 1200, originalHeight: 720, thumbnailUrl: '/post/image?mblogId=local-1&pid=p1&variant=thumbnail', originalUrl: '/post/image?mblogId=local-1&pid=p1&variant=original' },
    { pid: 'p2', thumbnailWidth: 0, thumbnailHeight: 0, originalWidth: 300, originalHeight: 180, thumbnailUrl: '', originalUrl: '/post/image?mblogId=local-1&pid=p2&variant=original' },
  ];
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await images.first().click();
  await expect(page).toHaveURL(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests.filter(value => value.startsWith('GET /post/image'))).toEqual([
    'GET /post/image?mblogId=local-1&pid=p1&variant=thumbnail',
    'GET /post/image?mblogId=local-1&pid=p2&variant=original',
  ]);
});

test('single_post_image_preserves_ratio_and_uses_known_fallback_dimensions', async ({ page }) => {
  posts.items[0].pics = [imageFixture('single', { thumbnailWidth: 0, thumbnailHeight: 0, originalWidth: 300, originalHeight: 180 })];
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
  const images = page.getByRole('img', { name: '转发微博图片', exact: true });
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.first().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(300);
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('width', '100px');
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('height', '100px');
  await expect(page.locator('.post-retweet-pics')).toHaveCSS('gap', '4px');
  await expect(page.locator('.post-retweet-pic').first()).toHaveCSS('background-image', /repeating-linear-gradient/);
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

test('avatars_and_verified_names_use_existing_fields_and_fall_back_safely', async ({ page }) => {
  await page.route('https://avatar.test/**', route => route.request().url().endsWith('/valid.svg')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="red"/></svg>' })
    : route.fulfill({ status: 404 }));
  bloggers[0] = { uid: 1, screenName: '第一位', avatar: 'https://avatar.test/valid.svg', verified: true };
  posts.items[0].blogger = bloggers[0];
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.post-avatar img')).toBeVisible();
  await expect.poll(() => page.locator('.post-avatar img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(48);
  await expect(page.locator('.blogger-list .blogger-avatar img')).toHaveAttribute('src', bloggers[0].avatar!);
  await expect(page.locator('.post-author').getByRole('img', { name: '已认证' })).toBeVisible();
  await expect(page.locator('.blogger-name').getByRole('img', { name: '已认证' })).toBeVisible();
  await expect(page.locator('.blogger-list .blogger-avatar').last()).toHaveText('第');
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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

test('minimum_desktop_keeps_headers_fixed_and_three_lists_independently_scrollable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 560 });
  bloggers = Array.from({ length: 40 }, (_, i) => ({ uid: i + 1, screenName: `博主 ${i + 1}` }));
  calendar.months[0].days = Array.from({ length: 28 }, (_, i) => ({ date: `2026-08-${String(28 - i).padStart(2, '0')}`, count: 1 }));
  posts.items[0].content = '长正文\n'.repeat(80);
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.post-content')).toBeVisible();
  const headerTop = (await page.locator('.feed-header').boundingBox())!.y;
  for (const selector of ['.bloggers-list', '.dates-list', '.posts']) {
    const list = page.locator(selector);
    await list.hover();
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  }
  expect((await page.locator('.feed-header').boundingBox())!.y).toBe(headerTop);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await expect(page.getByRole('link', { name: '正式 post 页面' })).toBeVisible();
  const year = page.getByRole('button', { name: '2026 年，3 条', exact: true });
  await year.focus();
  await expect(year).toHaveCSS('outline-width', '3px');
  await expect(year).toHaveCSS('outline-offset', '2px');
  await page.keyboard.press('Enter');
  await expect(year).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(year).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: testInfo.outputPath('minimum-desktop.png') });
});

test('default_reading_uses_latest_valid_day_shanghai_bounds_and_backend_total', async ({ page }) => {
  calendar.months = [
    { month: '2026-09', count: 0, days: [{ date: '2026-09-31', count: 1 }] },
    { month: '2026-07', count: 1, days: [{ date: '2026-07-10', count: 1 }] },
    { month: '2026-08', count: 3, days: [{ date: '2026-08-05', count: 3 }] },
  ];
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await expect(original.locator('.post-retweet-content')).toHaveCSS('font-size', '17px');
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  expect(requests.map(value => value.split('?')[0])).toEqual(['GET /post/bloggers', 'GET /post/calendar', 'GET /post/list']);
  await page.screenshot({ path: testInfo.outputPath('retweet-reading.png') });
});

test('pure_retweet_omits_empty_outer_body_and_handles_missing_original_information', async ({ page }) => {
  posts.items[0].content = '';
  posts.items[0].retweeted = { screenName: null, content: '纯转发原文' };
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.post-retweet')).toContainText('纯转发原文');
  await expect(page.locator('.post-retweet-author')).toHaveText('@未知用户');
  await expect(page.locator('.post-content')).toHaveCount(0);
  await expect(page.locator('.post-header')).toContainText('第一位');
  await expect(page.locator('.post-header time')).toHaveText('2026-08-05 08:30');
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.post-retweet-content')).toHaveText(raw);
  await expect(page.locator('.post-retweet-content img, .post-retweet-content b')).toHaveCount(0);
  await expect(page.locator('.post-content')).toHaveText(posts.items[0].content);
  await expect(page.locator('.post-content br')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { retweetAttack?: number }).retweetAttack)).toBeUndefined();
  await page.getByRole('button', { name: '第二位', exact: true }).click();
  await expect(page.getByRole('button', { name: '第二位', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.post-retweet-content')).toHaveText(raw);
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
  posts.items[0].createdAt = Date.parse('2025-12-31T00:30:00Z');
  await page.getByRole('button', { name: '2025-12-31', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('较早日期正文');
  await expect(page.locator('.date-item[aria-label=\"2025-12-31\"]')).toHaveAttribute('aria-pressed', 'true');
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  posts.items[0].content = '长正文阅读\n'.repeat(80);
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('article')).toBeVisible();
  const dateButton = page.getByRole('button', { name: '2026-08-05', exact: true });
  const dateTop = (await dateButton.boundingBox())!.y;
  const feed = page.locator('.posts');
  await feed.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => feed.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await dateButton.boundingBox())!.y).toBe(dateTop);
  expect(await page.getByRole('region', { name: '博主区域', exact: true }).evaluate(element => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.locator('.date-item[aria-label=\"2026-08-05\"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('博文总数')).toHaveText('共 0 条');
});

test('calendar_error_retains_loaded_bloggers_and_backend_message', async ({ page }) => {
  calendarStatus = 500;
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.getByRole('alert')).toHaveText('日期加载失败，请刷新页面重试。（本地读取暂时不可用）');
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  expect(requests).toEqual(['GET /post/bloggers', 'GET /post/calendar']);
});

test('list_retry_only_recovers_list_and_keeps_blogger_and_date_regions', async ({ page }) => {
  listStatus = 500;
  await page.goto(`${baseUrl}preview/post/index.html`);
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
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('post_displays_names_from_proxied_query', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}preview/post/index.html`);
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
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
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(43, 38, 32)');
  await expect(page.locator('body')).toHaveCSS('background-image', /radial-gradient/);
  await page.reload();
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
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
  await expect(page.locator('.blogger-list .blogger-name')).toHaveText(['第一位', '第二位']);
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
