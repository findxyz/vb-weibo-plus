import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { PostList } from '../src/post/queries';

let vite: ViteDevServer;
let baseUrl: string;
let reads: string[];
let writes: string[];
let liked: boolean;
let count: number;
let posts: PostList;

test.beforeAll(async () => {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0];
});

test.afterAll(async () => { await vite?.close(); });

test.beforeEach(async ({ page }) => {
  reads = [];
  writes = [];
  liked = false;
  count = 7;
  posts = { items: [{ mblogId: 'outer-repost', content: '本地保存的转发微博',
    createdAt: Date.parse('2026-10-31T00:00:00Z'), blogger: { uid: 1, screenName: '测试博主' },
    postUrl: 'https://weibo.com/1/example',
    retweeted: { screenName: '原作者', content: '内嵌原文' } }], page: 1, size: 9999, total: 1 };
  await page.route('**/weibo/login/status', route => route.fulfill({ json: { valid: true } }));
  await page.route(url => url.pathname === '/post/bloggers', route => route.fulfill({ json: [{ uid: 1, screenName: '测试博主' }] }));
  await page.route(url => url.pathname === '/post/calendar', route => route.fulfill({ json: {
    months: [{ month: '2026-10', count: 12, days: [{ date: '2026-10-31', count: 12 }] }],
  } }));
  await page.route(url => url.pathname === '/post/list', route => route.fulfill({ json: posts }));
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().postData() ?? '');
      liked = new URLSearchParams(route.request().postData() ?? '').get('liked') === 'true';
      count += liked ? 1 : -1;
    } else reads.push(new URL(route.request().url()).searchParams.get('mblogId')!);
    await route.fulfill({ json: { liked, count } });
  });
});

test('visible_outer_post_shows_remote_count_and_reuses_state_during_browsing', async ({ page }) => {
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toBeEnabled();
  await expect(page.getByLabel('当前点赞数：7', { exact: true })).toBeVisible();
  expect(reads).toEqual(['outer-repost']);
  await expect(page.locator('.post-retweet button')).toHaveCount(0);
  await page.getByRole('button', { name: '测试博主', exact: true }).click();
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toBeEnabled();
  expect(reads).toEqual(['outer-repost']);
  expect(writes).toEqual([]);
});

test('like_waits_for_confirmation_disables_repeat_clicks_and_can_be_cancelled', async ({ page }) => {
  let release: (() => Promise<void>) | undefined;
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST' || writes.length) return route.fallback();
    writes.push(route.request().postData()!);
    await new Promise<void>(resolve => { release = async () => {
      liked = true;
      count = 8;
      await route.fulfill({ json: { liked, count } });
      resolve();
    }; });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在处理点赞' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '正在处理点赞' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('当前点赞数：7', { exact: true })).toBeVisible();
  expect(writes).toEqual(['mblogId=outer-repost&liked=true']);
  await release!();
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('当前点赞数：8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toBeEnabled();
  await expect(page.getByLabel('当前点赞数：7', { exact: true })).toBeVisible();
  expect(writes).toEqual(['mblogId=outer-repost&liked=true', 'mblogId=outer-repost&liked=false']);
  expect(reads).toEqual(['outer-repost']);
});

test('unknown_state_can_be_retried_without_sending_a_like', async ({ page }) => {
  await page.route(url => url.pathname === '/post/like', async route => {
    if (reads.length) return route.fallback();
    reads.push('outer-repost');
    await route.fulfill({ status: 502, json: { msg: '微博状态暂时不可用' } });
  });
  await page.goto(`${baseUrl}post/index.html`);
  const retry = page.getByRole('button', { name: '重试查询点赞状态' });
  await expect(retry).toBeEnabled();
  await expect(retry).not.toHaveAttribute('aria-pressed');
  await expect(page.locator('.post-like-count')).toHaveCount(0);
  await retry.click();
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toBeEnabled();
  expect(reads).toEqual(['outer-repost', 'outer-repost']);
  expect(writes).toEqual([]);
});

test('failed_write_reconciles_state_and_displays_security_challenge', async ({ page }) => {
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postData()!);
    await route.fulfill({ status: 502, json: { msg: '微博要求安全验证，请前往微博网页版完成验证后重试。' } });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.locator('.post-like-error')).toContainText('微博要求安全验证');
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('当前点赞数：7', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(2);
});

test('timed_out_write_is_reconciled_without_resending', async ({ page }) => {
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postData()!);
    liked = true;
    count = 8;
    await new Promise(() => {});
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByLabel('当前点赞数：8', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(2);
});

test('unconfirmed_write_hides_old_state_until_manual_query_succeeds', async ({ page }) => {
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().postData()!);
      liked = true;
      count = 8;
      return route.abort('failed');
    }
    if (writes.length && reads.length === 1) {
      reads.push('outer-repost');
      return route.fulfill({ status: 502, json: { msg: '查询失败' } });
    }
    return route.fallback();
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  const retry = page.getByRole('button', { name: '重试查询点赞状态' });
  await expect(retry).toBeEnabled();
  await expect(page.locator('.post-like-count')).toHaveCount(0);
  await expect(retry).not.toHaveAttribute('aria-pressed');
  await retry.click();
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toBeEnabled();
  expect(writes).toHaveLength(1);
});

test('only_visible_posts_are_queried_and_scroll_back_reuses_state', async ({ page }) => {
  posts.items = Array.from({ length: 12 }, (_, index) => ({ ...posts.items[0],
    mblogId: `post-${index}`, content: '正文<br>'.repeat(8), retweeted: null }));
  posts.total = 12;
  await page.goto(`${baseUrl}post/index.html`);
  await expect(page.locator('.post-like-button').first()).toHaveAttribute('aria-pressed', 'false');
  expect(reads).toContain('post-0');
  expect(reads).not.toContain('post-11');
  await page.getByRole('article').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.post-like-button').last()).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('article').first().scrollIntoViewIfNeeded();
  expect(reads.filter(id => id === 'post-0')).toHaveLength(1);
  expect(reads.filter(id => id === 'post-11')).toHaveLength(1);
  expect(writes).toEqual([]);
});

test('logging_in_again_discards_previous_account_like_cache', async ({ page }) => {
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postData()!);
    await route.fulfill({ status: 401, json: { msg: '登录已失效' } });
  });
  await page.route('**/weibo/login/qr', route => route.fulfill({ json: {} }));
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '扫码登录' })).toBeVisible();
  await expect(page.locator('.post-like-button')).toBeDisabled();
  liked = true;
  count = 8;
  await page.getByRole('button', { name: '扫码登录' }).click();
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toBeEnabled();
  await expect(page.getByLabel('当前点赞数：8', { exact: true })).toBeVisible();
  expect(reads).toHaveLength(2);
});

test('switching_reading_scope_keeps_inflight_like_locked_and_updates_shared_state', async ({ page }) => {
  let release: (() => Promise<void>) | undefined;
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postData()!);
    liked = true;
    count = 8;
    await new Promise<void>(resolve => { release = async () => {
      await route.fulfill({ json: { liked, count } });
      resolve();
    }; });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在处理点赞' })).toBeDisabled();
  try {
    await page.getByRole('button', { name: '测试博主', exact: true }).click();
    await expect(page.getByRole('button', { name: '正在处理点赞' })).toBeDisabled();
  } finally { await release!(); }
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toBeEnabled();
  await expect(page.getByLabel('当前点赞数：8', { exact: true })).toBeVisible();
  expect(writes).toEqual(['mblogId=outer-repost&liked=true']);
  expect(reads).toEqual(['outer-repost']);
});

test('switching_reading_scope_preserves_the_security_challenge_feedback', async ({ page }) => {
  let release: (() => Promise<void>) | undefined;
  await page.route(url => url.pathname === '/post/like', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postData()!);
    await new Promise<void>(resolve => { release = async () => {
      await route.fulfill({ status: 502, json: { msg: '微博要求安全验证，请前往微博网页版完成验证后重试。' } });
      resolve();
    }; });
  });
  await page.goto(`${baseUrl}post/index.html`);
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在处理点赞' })).toBeDisabled();
  await page.getByRole('button', { name: '测试博主', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在处理点赞' })).toBeDisabled();
  await release!();
  await expect(page.locator('.post-like-error')).toContainText('前往微博网页版完成验证');
  await expect(page.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(writes).toHaveLength(1);
});

test('like_controls_fit_the_starry_layout_and_support_keyboard', async ({ page }, testInfo) => {
  await page.goto(`${baseUrl}post/index.html`);
  for (const width of [900, 1280, 1600]) {
    await page.setViewportSize({ width, height: 800 });
    const button = page.getByRole('button', { name: '点赞', exact: true });
    await expect(button).toBeEnabled();
    const card = (await page.getByRole('article').boundingBox())!;
    const actions = (await page.locator('.post-action-links').boundingBox())!;
    expect(actions.x + actions.width).toBeLessThanOrEqual(card.x + card.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.getByRole('button', { name: '点赞', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '取消点赞', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('post-likes.png') });
});
