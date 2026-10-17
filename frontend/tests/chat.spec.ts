import { createServer as createHttpServer, type Server, type ServerResponse } from 'node:http';
import { test, expect, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { STORAGE_KEYS } from '../../src/main/resources/static/shared/storage-keys.js';
import { compareMessages, type ChatGroup, type ChatMessage } from '../src/chat/api';

const BASE_TIME = Date.parse('2026-08-05T00:00:00Z');

let backend: Server;
let vite: ViteDevServer;
let baseUrl: string;
let requests: string[];
let pageErrors: string[];
let writeRequests: string[];

let groups: ChatGroup[];
let groupsStatus: number;
let messagesByGid: Map<number, ChatMessage[]>;
let messagesStatus: Map<number, number>;
let holdPredicate: ((url: URL) => boolean) | null;
let held: { url: URL; send: () => void }[];
let mediaHoldMids: Set<number>;
let heldMedia: Map<number, () => void>;

function makeGroup(gid: number, name: string, extra: Partial<ChatGroup> = {}): ChatGroup {
  return {
    gid, name, avatar: '', memberCount: 10, maxMember: 50, ownerId: 1, admins: [],
    summary: '', groupType: 0, latestSenderName: '', latestMessage: '', messageCount: 0, ...extra,
  };
}

function messageTime(mid: number) {
  return BASE_TIME + mid * 60000;
}

function makeMessages(gid: number, count: number, label: string): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const mid = index + 1;
    return {
      mid, gid, msgType: 1, msgTypeName: '文本', mediaType: 0,
      senderId: 100 + (mid % 3), senderName: `成员${mid % 3}`, senderAvatar: '',
      text: `${label} ${mid}`, urlObjects: null, picInfos: null, template: null, templateData: null,
      recallMids: null, recallBy: null, createdAt: messageTime(mid), savedAt: messageTime(mid),
      previewUrl: '', originalUrl: '', videoUrl: '', fileUrl: '',
    };
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8' });
  response.end(JSON.stringify(body));
}

function buildPage(url: URL, gid: number) {
  const size = Number(url.searchParams.get('size'));
  const list = [...(messagesByGid.get(gid) ?? [])].sort(compareMessages);
  const beforeMid = url.searchParams.get('beforeMid');
  let slice: ChatMessage[];
  let hasMore: boolean;
  if (beforeMid != null) {
    const beforeIndex = list.findIndex(message => message.mid === Number(beforeMid));
    const end = beforeIndex < 0 ? list.length : beforeIndex;
    slice = list.slice(Math.max(0, end - size), end);
    hasMore = end - size > 0;
  } else {
    slice = list.slice(Math.max(0, list.length - size));
    hasMore = list.length > slice.length;
  }
  const first = slice[0];
  return {
    group: groups.find(group => group.gid === gid) ?? null,
    items: slice, size, hasMore,
    nextBeforeCreatedAt: hasMore && first ? first.createdAt : null,
    nextBeforeMid: hasMore && first ? first.mid : null,
    nextAfterCreatedAt: null, nextAfterMid: null,
  };
}

function mediaBody() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">'
    + '<rect width="320" height="180" fill="#9cc7e8"/></svg>';
}

async function openChat(page: Page, lastGid?: number) {
  if (lastGid != null) {
    await page.addInitScript(([key, value]: [string, number]) => {
      localStorage.setItem(key, String(value));
    }, [STORAGE_KEYS.CHAT_LAST_GROUP, lastGid] as [string, number]);
  }
  await page.goto(`${baseUrl}preview/chat/index.html`);
}

async function atBottom(page: Page) {
  return page.locator('.messages').evaluate(element =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - 2);
}

function releaseHeld() {
  for (const { send } of held.splice(0)) send();
}

function releaseMedia(mid: number) {
  heldMedia.get(mid)?.();
  heldMedia.delete(mid);
}

test.beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture');
    const path = url.pathname;
    requests.push(`${request.method} ${request.url}`);
    if (path === '/chat/groups') {
      const send = () => sendJson(response, groupsStatus, groupsStatus === 200 ? groups : { msg: '本地群聊暂时不可用' });
      if (holdPredicate?.(url)) { held.push({ url, send }); return; }
      send();
      return;
    }
    if (path === '/chat/messages/cursor') {
      const gid = Number(url.searchParams.get('gid'));
      const status = messagesStatus.get(gid) ?? 200;
      const send = () => {
        if (status !== 200) { sendJson(response, status, { msg: '本地消息暂时不可用' }); return; }
        sendJson(response, 200, buildPage(url, gid));
      };
      if (holdPredicate?.(url)) { held.push({ url, send }); return; }
      send();
      return;
    }
    if (path === '/chat/media') {
      const mid = Number(url.searchParams.get('mid'));
      const send = () => {
        response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        response.end(mediaBody());
      };
      if (mediaHoldMids.has(mid)) { heldMedia.set(mid, send); return; }
      send();
      return;
    }
    if (path === '/chat/image') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#4ba7ec"/></svg>');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP server address');
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${address.port}`;
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0];
});

test.afterAll(async () => {
  await vite?.close();
  await new Promise<void>(resolve => backend?.close(() => resolve()));
  delete process.env.API_PROXY_TARGET;
});

test.beforeEach(({ page }) => {
  requests = [];
  pageErrors = [];
  writeRequests = [];
  groups = [makeGroup(1, '第一群'), makeGroup(2, '第二群')];
  groupsStatus = 200;
  messagesByGid = new Map();
  messagesStatus = new Map();
  holdPredicate = null;
  held = [];
  mediaHoldMids = new Set();
  heldMedia = new Map();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writeRequests.push(`${request.method()} ${request.url()}`);
  });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(writeRequests).toEqual([]);
});

test('chat_selects_the_saved_group_and_lands_on_the_newest_messages', async ({ page }, testInfo) => {
  messagesByGid.set(1, makeMessages(1, 60, '群一'));
  messagesByGid.set(2, makeMessages(2, 60, '群二'));
  await openChat(page, 2);

  await expect(page.getByRole('heading', { name: '微博群聊 - 第二群' })).toBeVisible();
  await expect(page.locator('.group-row.active .group-name')).toHaveText('第二群');
  await expect(page.locator('.message')).toHaveCount(50);
  await expect(page.locator('.message').last()).toContainText('群二 60');
  await expect.poll(() => atBottom(page)).toBe(true);
  expect(requests).toEqual(['GET /chat/groups', 'GET /chat/messages/cursor?gid=2&size=50']);

  await page.waitForTimeout(1200);
  expect(requests).toHaveLength(2);

  await page.reload();
  await expect(page.locator('.message').last()).toContainText('群二 60');
  await expect.poll(() => atBottom(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat.png') });
});

test('chat_bounds_the_rendered_window_and_jumps_across_unloaded_messages', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 800, '消息'));
  await openChat(page);

  await expect(page.locator('.message')).toHaveCount(50);
  await expect(page.locator('.message').last()).toHaveAttribute('data-mid', '800');

  // 连续向上翻页到 400 条，DOM 仍受 360 条窗口上限约束。
  for (let index = 1; index <= 7; index += 1) {
    await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
    await expect.poll(() => requests.filter(value => value.includes('beforeMid=')).length).toBe(index);
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.message')).toHaveCount(360);
  await expect(page.locator('.message').first()).toHaveAttribute('data-mid', '401');

  // 跳到末尾再跳回顶部：跨越整段未渲染区间仍能定位到目标消息。
  await page.locator('.messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-mid="800"]')).toBeInViewport();
  await expect(page.locator('.message')).toHaveCount(360);
  // 未渲染区间按实测高度回写占位：40 条已测消息的占位应小于按估算高度 112px 计的值。
  const topSpacer = await page.locator('.messages .list-spacer').first()
    .evaluate(element => Number.parseFloat((element as HTMLElement).style.height));
  expect(topSpacer).toBeGreaterThan(0);
  expect(topSpacer).toBeLessThan(40 * 112);
  await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('[data-mid="401"]')).toBeInViewport();
});

test('chat_loads_earlier_messages_at_the_anchor_without_duplicate_requests', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 120, '消息'));
  holdPredicate = url => url.searchParams.has('beforeMid');
  await openChat(page);

  await expect(page.locator('.message').last()).toContainText('消息 120');
  await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
  await expect.poll(() => held.length).toBe(1);
  const anchorTop = await page.locator('[data-mid="71"]').evaluate(element => element.getBoundingClientRect().top);

  const request = held[0].url;
  expect(request.searchParams.get('gid')).toBe('1');
  expect(request.searchParams.get('size')).toBe('50');
  expect(request.searchParams.get('beforeMid')).toBe('71');
  expect(Number(request.searchParams.get('beforeCreatedAt'))).toBe(messageTime(71));

  await page.locator('.messages').evaluate(element => element.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(200);
  expect(held).toHaveLength(1);

  releaseHeld();
  await expect.poll(async () => {
    const top = await page.locator('[data-mid="71"]').evaluate(element => element.getBoundingClientRect().top);
    return Math.abs(top - anchorTop);
  }).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-mid="21"]')).toHaveCount(1);
});

test('chat_holds_the_true_bottom_while_images_load_and_stops_after_user_input', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  items[59].previewUrl = '/chat/media?gid=1&mid=60&variant=preview';
  items[49].previewUrl = '/chat/media?gid=1&mid=50&variant=preview';
  messagesByGid.set(1, items);
  mediaHoldMids = new Set([60, 50]);
  await openChat(page);

  await expect(page.locator('[data-mid="60"] img')).toHaveCount(1);
  await expect.poll(() => heldMedia.size).toBe(2);
  await expect.poll(() => atBottom(page)).toBe(true);

  releaseMedia(60);
  await expect.poll(() => page.locator('[data-mid="60"] img').evaluate(image =>
    (image as HTMLImageElement).naturalWidth)).toBe(320);
  await expect.poll(() => atBottom(page)).toBe(true);

  await page.locator('.messages').hover();
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(120);
  const pausedAt = await page.locator('.messages').evaluate(element => element.scrollTop);

  releaseMedia(50);
  await expect.poll(() => page.locator('[data-mid="50"] img').evaluate(image =>
    (image as HTMLImageElement).naturalWidth)).toBe(320);
  expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(pausedAt);
});

test('chat_explains_an_empty_group_without_loading_earlier_pages', async ({ page }) => {
  messagesByGid.set(1, []);
  await openChat(page);

  await expect(page.locator('.message')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('这个群还没有本地消息。');
  expect(requests).toEqual(['GET /chat/groups', 'GET /chat/messages/cursor?gid=1&size=50']);
});

test('chat_explains_an_empty_group_list_without_requesting_messages', async ({ page }) => {
  groups = [];
  await openChat(page);

  await expect(page.getByRole('status')).toHaveText('还没有群聊。');
  await expect(page.locator('.messages-state')).toHaveText('暂无群聊。');
  expect(requests).toEqual(['GET /chat/groups']);
});

test('chat_degrades_video_messages_to_text_and_only_previews_images', async ({ page }) => {
  const items = makeMessages(1, 2, '消息');
  items[0].previewUrl = '/chat/media?gid=1&mid=1&variant=preview';
  items[1].previewUrl = '/chat/media?gid=1&mid=2&variant=preview';
  items[1].videoUrl = '/chat/media?gid=1&mid=2&variant=video';
  items[1].mediaType = 10;
  items[1].text = '分享视频';
  messagesByGid.set(1, items);
  await openChat(page);

  await expect(page.locator('[data-mid="1"] img')).toHaveCount(1);
  await expect(page.locator('[data-mid="2"] img')).toHaveCount(0);
  await expect(page.locator('[data-mid="2"] .bubble')).toHaveText('分享视频');
});

test('chat_links_urls_and_renders_known_emoji', async ({ page }) => {
  const items = makeMessages(1, 2, '消息');
  items[0].text = '前文 https://example.com/a?b=1。后文 [doge] [不存在] [/abc.png]';
  items[1].text = '结尾 https://example.com/x.';
  messagesByGid.set(1, items);
  await page.route('https://face.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f4a51d"/></svg>',
  }));
  await page.route('https://img.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#086ce0"/></svg>',
  }));
  await openChat(page);

  const first = page.locator('[data-mid="1"]');
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com/a?b=1');
  await expect(first.locator('a')).toHaveAttribute('target', '_blank');
  await expect(first.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(first.locator('a')).toHaveText('https://example.com/a?b=1');
  await expect(first.locator('.bubble')).toContainText('。后文');
  await expect(first.locator('.bubble')).toContainText('[不存在]');

  const emojis = first.locator('img.emoji');
  await expect(emojis).toHaveCount(2);
  await expect(emojis.first()).toHaveAttribute('alt', '[doge]');
  await expect(emojis.first()).toHaveAttribute('loading', 'lazy');
  await expect(emojis.first()).toHaveAttribute('src', /^https:\/\/face\.t\.sinajs\.cn\/.+/);
  await expect(emojis.last()).toHaveAttribute('alt', '[/abc.png]');
  await expect(emojis.last()).toHaveAttribute('src', 'https://img.t.sinajs.cn/t4/appstyle/expression/emimage/abc.png');

  const second = page.locator('[data-mid="2"]');
  await expect(second.locator('a')).toHaveAttribute('href', 'https://example.com/x');
  await expect(second.locator('.bubble')).toContainText('结尾 https://example.com/x.');
});

test('chat_renders_file_downloads_and_weibo_share_cards', async ({ page }) => {
  const items = makeMessages(1, 3, '消息');
  items[0].fileUrl = '/chat/media?gid=1&mid=1&variant=file';
  items[0].text = '说明.txt';
  items[1].mediaType = 14;
  items[1].text = '分享微博';
  items[1].urlObjects = [{
    status: { user: { screen_name: '原作者' }, text: `<b>摘要</b>${'字'.repeat(120)}` },
    url_ori: 'https://weibo.com/1/share',
  }];
  items[2].mediaType = 14;
  items[2].text = '分享微博';
  items[2].urlObjects = [{ status: { user: { screen_name: '另一个人' }, text: '正文' }, url_ori: 'javascript:alert(1)' }];
  messagesByGid.set(1, items);
  await openChat(page);

  const file = page.locator('[data-mid="1"] .file-download');
  await expect(file).toHaveAttribute('href', '/chat/media?gid=1&mid=1&variant=file');
  await expect(file).toHaveAttribute('download', '说明.txt');
  await expect(file).toHaveText('说明.txt');
  await expect(page.locator('[data-mid="1"] .bubble')).toHaveText('说明.txt');

  const card = page.locator('[data-mid="2"] .weibo-card');
  await expect(card.locator('.weibo-card-author')).toHaveText('原作者');
  await expect(card.locator('.weibo-card-summary')).toHaveText(/^摘要字+…$/);
  const summary = await card.locator('.weibo-card-summary').textContent();
  expect(summary ?? '').toHaveLength(101);
  await expect(card.locator('.weibo-card-link')).toHaveAttribute('href', 'https://weibo.com/1/share');
  await expect(card.locator('.weibo-card-link')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(card.locator('.weibo-card-link')).toHaveText('查看微博');

  await expect(page.locator('[data-mid="3"] .weibo-card-author')).toHaveText('另一个人');
  await expect(page.locator('[data-mid="3"] .weibo-card-link')).toHaveCount(0);
});

test('chat_keeps_markup_in_message_text_literal', async ({ page }) => {
  const items = makeMessages(1, 1, '消息');
  items[0].text = '<script>window.attack=1</script><img src=x onerror="window.attack=2">';
  messagesByGid.set(1, items);
  await openChat(page);

  const bubble = page.locator('[data-mid="1"] .bubble');
  await expect(bubble).toContainText('<script>window.attack=1</script>');
  await expect(bubble.locator('script, img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { attack?: number }).attack)).toBeUndefined();
});

test('chat_switch_group_ignores_the_late_response_of_the_previous_group', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '旧群'));
  messagesByGid.set(2, makeMessages(2, 3, '新群'));
  holdPredicate = url => url.searchParams.get('gid') === '1';
  await openChat(page);

  await expect(page.getByRole('status')).toHaveText('正在加载消息……');
  await page.locator('.group-row', { hasText: '第二群' }).click();
  await expect(page.locator('.message').last()).toContainText('新群 3');
  releaseHeld();
  await page.waitForTimeout(200);
  await expect(page.locator('.message')).toHaveCount(3);
  await expect(page.locator('.messages')).not.toContainText('旧群');
  await expect(page.getByRole('heading', { name: '微博群聊 - 第二群' })).toBeVisible();
});

test('chat_switch_group_discards_the_previous_groups_earlier_page_and_image', async ({ page }) => {
  const previous = makeMessages(1, 60, '旧群');
  previous[59].previewUrl = '/chat/media?gid=1&mid=60&variant=preview';
  messagesByGid.set(1, previous);
  messagesByGid.set(2, makeMessages(2, 3, '新群'));
  mediaHoldMids = new Set([60]);
  holdPredicate = url => url.searchParams.get('gid') === '1' && url.searchParams.has('beforeMid');
  await openChat(page);

  await expect(page.locator('.message').last()).toContainText('旧群 60');
  await expect.poll(() => heldMedia.size).toBe(1);
  await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
  await expect.poll(() => held.length).toBe(1);

  await page.locator('.group-row', { hasText: '第二群' }).click();
  await expect(page.locator('.message').last()).toContainText('新群 3');
  releaseHeld();
  releaseMedia(60);
  await page.waitForTimeout(200);
  await expect(page.locator('.message')).toHaveCount(3);
  await expect(page.locator('.messages')).not.toContainText('旧群');
});

test('chat_group_list_failure_shows_a_retry_entry', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  groupsStatus = 503;
  await openChat(page);

  await expect(page.getByRole('alert')).toContainText('群聊列表加载失败，请稍后重试。');
  groupsStatus = 200;
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.locator('.group-row')).toHaveCount(2);
  await expect(page.locator('.message').last()).toContainText('消息 3');
});
test('chat_message_failure_retries_when_the_group_is_selected_again', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesStatus.set(1, 500);
  await openChat(page);

  await expect(page.getByRole('alert')).toContainText('消息加载失败，点击左侧群聊重试。');
  messagesStatus.set(1, 200);
  await page.locator('.group-row').first().click();
  await expect(page.locator('.message').last()).toContainText('消息 3');
});

test('chat_shell_keeps_the_blue_skeuomorphic_geometry_at_minimum_window', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 60, '消息'));
  await page.setViewportSize({ width: 900, height: 560 });
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');

  const metrics = await page.evaluate(() => {
    const titlebar = document.querySelector('.titlebar')!.getBoundingClientRect();
    const panel = document.querySelector('.groups-panel')!.getBoundingClientRect();
    const bubble = getComputedStyle(document.querySelector('.bubble')!);
    const messages = document.querySelector('.messages')!;
    return {
      titlebarHeight: titlebar.height,
      panelWidth: panel.width,
      bubbleRadius: bubble.borderRadius,
      bubbleBorder: bubble.borderTopColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      overflowY: getComputedStyle(messages).overflowY,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(metrics.titlebarHeight).toBe(38);
  expect(metrics.panelWidth).toBe(280);
  expect(metrics.bubbleRadius).toBe('4px');
  expect(metrics.bubbleBorder).toBe('rgb(167, 189, 205)');
  expect(metrics.bodyBackground).toBe('rgb(185, 216, 242)');
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollWidth).toBeLessThanOrEqual(900);
});
