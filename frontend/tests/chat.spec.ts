import { createServer as createHttpServer, type Server, type ServerResponse } from 'node:http';
import { test, expect, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { STORAGE_KEYS } from '../src/shared/storage-keys.js';
import { calendarMonthsAgo, localDateValue, shanghaiToday } from '../src/shared/date.js';
import { compareMessages, type AnalysisView, type ChatGroup, type ChatMessage } from '../src/chat/api';
import { trimMessageCache } from '../src/chat/message-cache';

const BASE_TIME = Date.parse('2026-08-05T00:00:00Z');
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const MP4_BYTES = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

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
let pollDelayMs: number;
let sendBodies: string[];
let sendStatus: number;
let onSend: (() => void) | null;
let mediaSendBodies: { url: string; body: string; contentType: string }[];
let mediaSendStatus: number;
let attitudesPayload: Record<string, { name?: string; count?: number; selected?: boolean }[]>;
let attitudesStatus: number;
let syncStatus: number;
let loginValid: boolean;
let qrStatus: number;
let qrHold: boolean;
let analysisItems: { id: number; date: string; promptPreview: string; messageCount: number; createdAt: string }[];
let analysisDetail: AnalysisView;
let analysisDeltas: string[];
let analysisDone: AnalysisView;
let analysisStreamError: string | null;
let analysisStreamBodies: string[];
let analysisStreamDelay: number;

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
  const afterMid = url.searchParams.get('afterMid');
  if (afterMid != null) {
    const afterIndex = list.findIndex(message => message.mid > Number(afterMid));
    const start = afterIndex < 0 ? list.length : afterIndex;
    const slice = list.slice(start, start + size);
    const last = slice[slice.length - 1];
    const hasMore = start + size < list.length;
    return {
      group: groups.find(group => group.gid === gid) ?? null,
      items: slice, size, hasMore,
      nextBeforeCreatedAt: null, nextBeforeMid: null,
      nextAfterCreatedAt: hasMore && last ? last.createdAt : null,
      nextAfterMid: hasMore && last ? last.mid : null,
    };
  }
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

function parseQueryTime(value: string | null) {
  return value ? Date.parse(`${value.replace(' ', 'T')}+08:00`) : null;
}

async function openChat(page: Page, lastGid?: number) {
  if (lastGid != null) {
    await page.addInitScript(([key, value]: [string, number]) => {
      localStorage.setItem(key, String(value));
    }, [STORAGE_KEYS.CHAT_LAST_GROUP, lastGid] as [string, number]);
  }
  await page.goto(`${baseUrl}chat/index.html`);
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
  backend = createHttpServer(async (request, response) => {
    const url = new URL(request.url!, 'http://fixture');
    const path = url.pathname;
    requests.push(`${request.method} ${request.url}`);
    if (path === '/chat/groups') {
      const send = () => sendJson(response, groupsStatus, groupsStatus === 200 ? groups : { msg: '本地群聊暂时不可用' });
      if (holdPredicate?.(url)) { held.push({ url, send }); return; }
      send();
      return;
    }
    if (path === '/weibo/login/status') {
      sendJson(response, 200, { valid: loginValid });
      return;
    }
    if (request.method === 'POST' && path === '/weibo/login/qr') {
      const send = () => {
        if (qrStatus === 200) { sendJson(response, 200, {}); return; }
        sendJson(response, qrStatus, { msg: '扫码登录失败' });
      };
      if (qrHold) { held.push({ url, send }); return; }
      send();
      return;
    }
    if (path === '/weibo/login/qr/image') {
      response.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">'
        + '<rect width="180" height="180" fill="#ffffff"/></svg>');
      return;
    }
    if (path === '/chat/analyses' && request.method === 'GET') {
      const page = Number(url.searchParams.get('page')) || 1;
      const size = Number(url.searchParams.get('size')) || 20;
      const offset = (page - 1) * size;
      sendJson(response, 200, {
        items: analysisItems.slice(offset, offset + size), page, size, total: analysisItems.length,
      });
      return;
    }
    if (request.method === 'POST' && path === '/chat/analyses/stream') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        analysisStreamBodies.push(body);
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        if (analysisStreamError) {
          response.write(`event: error\ndata: ${analysisStreamError}\n\n`);
          response.end();
          return;
        }
        let index = 0;
        const writeNext = () => {
          if (index < analysisDeltas.length) {
            response.write(`event: delta\ndata: ${analysisDeltas[index++]}\n\n`);
            setTimeout(writeNext, 60);
            return;
          }
          setTimeout(() => {
            response.write(`event: done\ndata: ${JSON.stringify(analysisDone)}\n\n`);
            response.end();
          }, 400);
        };
        setTimeout(writeNext, analysisStreamDelay);
      });
      return;
    }
    if (request.method === 'GET' && path.startsWith('/chat/analyses/')) {
      const id = Number(path.slice('/chat/analyses/'.length));
      if (!Number.isSafeInteger(id) || id <= 0) { sendJson(response, 404, { msg: '分析不存在' }); return; }
      sendJson(response, 200, { ...analysisDetail, id });
      return;
    }
    if (request.method === 'POST' && (path === '/chat/messages/sendImage' || path === '/chat/messages/sendVideo')) {
      let body = '';
      const contentType = request.headers['content-type'] ?? '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        mediaSendBodies.push({ url: path, body, contentType });
        if (mediaSendStatus === 200) onSend?.();
        sendJson(response, mediaSendStatus, mediaSendStatus === 200 ? {} : { msg: '附件发送失败' });
      });
      return;
    }
    if (request.method === 'POST' && path === '/chat/messages/send') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        sendBodies.push(body);
        if (sendStatus === 200) onSend?.();
        sendJson(response, sendStatus, sendStatus === 200 ? {} : {
          msg: sendStatus === 409 ? '已发出但本地同步失败' : '发送失败',
        });
      });
      return;
    }
    if (request.method === 'POST' && path === '/chat/since') {
      const send = () => {
        if (syncStatus === 204) { response.writeHead(204); response.end(); return; }
        sendJson(response, syncStatus, { msg: '同步失败' });
      };
      if (holdPredicate?.(url)) { held.push({ url, send }); return; }
      send();
      return;
    }
    if (path === '/chat/messages') {
      const gid = Number(url.searchParams.get('gid'));
      const page = Number(url.searchParams.get('page')) || 1;
      const size = Number(url.searchParams.get('size')) || 20;
      const start = parseQueryTime(url.searchParams.get('start'));
      const end = parseQueryTime(url.searchParams.get('end'));
      const sender = url.searchParams.get('senderName');
      const keyword = url.searchParams.get('keyword');
      const filtered = [...(messagesByGid.get(gid) ?? [])].sort(compareMessages).filter(message => {
        if (start != null && message.createdAt < start) return false;
        if (end != null && message.createdAt > end) return false;
        if (sender && message.senderName !== sender) return false;
        if (keyword && !(message.text ?? '').includes(keyword)) return false;
        return true;
      });
      const offset = (page - 1) * size;
      const send = () => sendJson(response, 200, {
        group: null, items: filtered.slice(offset, offset + size), page, size, total: filtered.length,
      });
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
      const isLatest = !url.searchParams.has('beforeMid') && !url.searchParams.has('afterMid');
      if (isLatest && pollDelayMs > 0) { setTimeout(send, pollDelayMs); return; }
      send();
      return;
    }
    if (path === '/chat/attitudes') {
      const mids = (url.searchParams.get('mids') ?? '').split(',');
      const result: typeof attitudesPayload = {};
      for (const mid of mids) if (attitudesPayload[mid]) result[mid] = attitudesPayload[mid];
      sendJson(response, attitudesStatus, attitudesStatus === 200 ? result : { msg: '表态读取失败' });
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
  pollDelayMs = 0;
  sendBodies = [];
  sendStatus = 200;
  onSend = null;
  mediaSendBodies = [];
  mediaSendStatus = 200;
  attitudesPayload = {};
  attitudesStatus = 200;
  syncStatus = 204;
  loginValid = true;
  qrStatus = 200;
  qrHold = false;
  analysisItems = [];
  analysisDetail = {
    id: 1, gid: 1, date: '2026-10-17', prompt: '总结今天群聊', result: '## 结论\n\n- 要点一\n- 要点二',
    messageCount: 12, createdAt: '2026-10-17 09:00',
  };
  analysisDeltas = ['## 结论\n\n', '- 要点一\n', '- 要点二'];
  analysisDone = { ...analysisDetail, result: analysisDeltas.join('') };
  analysisStreamError = null;
  analysisStreamBodies = [];
  analysisStreamDelay = 60;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (['GET', 'HEAD'].includes(request.method())) return;
    // 发送与历史采集是业务写操作，单独记录；其他写请求仍由 afterEach 拦截。
    if (request.method() === 'POST' && request.url().includes('/chat/messages/send')) return;
    if (request.method() === 'POST' && request.url().includes('/chat/since')) return;
    if (request.method() === 'POST' && request.url().includes('/weibo/login/qr')) return;
    if (request.method() === 'POST' && request.url().includes('/chat/analyses')) return;
    writeRequests.push(`${request.method()} ${request.url()}`);
  });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(writeRequests).toEqual([]);
});

test('formal_chat_entry_refreshes_and_retires_the_preview_document', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '正式消息'));
  const response = await page.goto(`${baseUrl}chat/index.html`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '微博群聊 - 第一群' })).toBeVisible();
  await expect(page.locator('.messages')).toContainText('正式消息 3');
  await page.reload();
  await expect(page.locator('.messages')).toContainText('正式消息 3');
  expect((await page.request.get(`${baseUrl}preview/chat/index.html`)).status()).toBe(404);
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
  const polled = requests.filter(value => !value.includes('/weibo/login/status'));
  expect(polled.slice(0, 2)).toEqual(['GET /chat/groups', 'GET /chat/messages/cursor?gid=2&size=50']);

  await page.waitForTimeout(2500);
  const afterPoll = requests.filter(value => !value.includes('/weibo/login/status'));
  expect(afterPoll.slice(2).every(value => value === 'GET /chat/groups'
    || value === 'GET /chat/messages/cursor?gid=2&size=50')).toBe(true);
  expect(afterPoll.length).toBeGreaterThanOrEqual(3);

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
  const after = await page.locator('.messages').evaluate(element => element.scrollTop);
  // 收尾已结束：撑高不得把视口拽回底部（Chrome 的滚动锚定允许小幅补偿）。
  expect(after - pausedAt).toBeLessThan(200);
  await expect.poll(() => atBottom(page)).toBe(false);
});

test('chat_explains_an_empty_group_without_loading_earlier_pages', async ({ page }) => {
  messagesByGid.set(1, []);
  await openChat(page);

  await expect(page.locator('.message')).toHaveCount(0);
  await expect(page.locator('.messages').getByRole('status')).toHaveText('这个群还没有本地消息。');
  const polled = requests.filter(value => !value.includes('/weibo/login/status'));
  expect(polled.slice(0, 2)).toEqual(['GET /chat/groups', 'GET /chat/messages/cursor?gid=1&size=50']);
});

test('chat_explains_an_empty_group_list_without_requesting_messages', async ({ page }) => {
  groups = [];
  await openChat(page);

  await expect(page.getByRole('status')).toHaveText('暂无群聊数据');
  await expect(page.locator('.messages-state')).toHaveText('暂无群聊。');
  await expect(page.getByRole('textbox', { name: '输入消息' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '😊 表情' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /图片/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /视频/ })).toBeDisabled();
  const groupRequests = requests.filter(value => !value.includes('/weibo/login/status'));
  expect(groupRequests.length).toBeGreaterThanOrEqual(1);
  expect(groupRequests.every(value => value === 'GET /chat/groups')).toBe(true);
});

test('chat_plays_video_in_place_without_navigation', async ({ page }) => {
  const items = makeMessages(1, 2, '消息');
  items[0].previewUrl = '/chat/media?gid=1&mid=1&variant=preview';
  items[1].previewUrl = '/chat/media?gid=1&mid=2&variant=preview';
  items[1].videoUrl = '/chat/media?gid=1&mid=2&variant=video';
  items[1].mediaType = 10;
  items[1].text = '分享视频';
  messagesByGid.set(1, items);
  await openChat(page);

  await expect(page.locator('[data-mid="1"] button.media-preview')).toHaveCount(1);
  await expect(page.locator('[data-mid="1"] video')).toHaveCount(0);
  await expect(page.locator('[data-mid="2"] button.video-preview')).toHaveCount(1);
  await expect(page.locator('[data-mid="2"] button.video-preview span')).toHaveCount(1);
  await expect(page.locator('[data-mid="2"] .bubble')).toHaveCount(0);

  await page.locator('[data-mid="2"] button.video-preview').click();
  const video = page.locator('[data-mid="2"] video.message-video');
  await expect(video).toHaveAttribute('src', '/chat/media?gid=1&mid=2&variant=video');
  await expect(video).toHaveAttribute('controls', '');
  await expect(page.locator('[data-mid="2"] button.video-preview')).toHaveCount(0);
  expect(page.url()).toContain('/chat/index.html');
});

test('chat_opens_original_image_and_closes_with_escape_or_backdrop', async ({ page }) => {
  const items = makeMessages(1, 1, '消息');
  items[0].previewUrl = '/chat/media?gid=1&mid=1&variant=preview';
  items[0].originalUrl = '/chat/media?gid=1&mid=1&variant=original';
  messagesByGid.set(1, items);
  await openChat(page);

  const trigger = page.locator('[data-mid="1"] button.media-preview');
  const dialog = page.locator('.messages-shell dialog.image-viewer');
  await trigger.click();
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(dialog.locator('img')).toHaveAttribute('src', '/chat/media?gid=1&mid=1&variant=original');
  await expect(dialog.locator('img')).toBeVisible();
  await expect(dialog.locator('.image-viewer-state')).toHaveText('');
  const scrollTop = await page.locator('.messages').evaluate(element => element.scrollTop);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveJSProperty('open', true);
  await expect(trigger).toBeFocused();
  expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(scrollTop);

  await trigger.click();
  await expect(dialog).toHaveJSProperty('open', true);
  await page.mouse.click(5, 5);
  await expect(dialog).not.toHaveJSProperty('open', true);
  await expect(page.locator('article.message[data-mid="1"]')).toBeVisible();
});

for (const context of ['messages', 'history'] as const) {
  test(`chat_image_viewer_zooms_and_drags_in_${context}`, async ({ page }) => {
    const items = makeMessages(1, 1, '长图消息');
    items[0].previewUrl = '/chat/media?gid=1&mid=1&variant=preview';
    items[0].originalUrl = '/chat/media?gid=1&mid=1&variant=original';
    messagesByGid.set(1, items);
    await page.route(/\/chat\/media\?.*variant=original/, route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3600"><text x="30" y="80" font-size="48">群聊长图</text></svg>',
    }));
    await openChat(page);
    const container = context === 'messages' ? page.locator('.messages-shell') : page.locator('dialog.history-dialog');
    if (context === 'history') {
      await page.getByRole('button', { name: '📜 聊天记录' }).click();
      await container.getByLabel('开始日期').fill('2026-08-05');
      await container.getByLabel('结束日期').fill('2026-08-07');
      await container.getByRole('button', { name: '🔍 查询' }).click();
      await container.locator('.history-result').click();
    }
    const trigger = container.locator('[data-mid="1"] button.media-preview');
    const viewer = container.locator('dialog.image-viewer');
    await trigger.click();
    const image = viewer.getByAltText('消息原图');
    await expect(image).toBeVisible();
    const initial = (await image.boundingBox())!;
    const scrollTop = await page.locator('.messages').evaluate(element => element.scrollTop);
    await image.hover();
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await image.boundingBox())!.height).toBeGreaterThan(initial.height * 1.5);
    const zoomed = (await image.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(720, 500, { steps: 5 });
    await page.mouse.up();
    await expect(viewer).toHaveJSProperty('open', true);
    await expect.poll(async () => Math.round((await image.boundingBox())!.x - zoomed.x)).toBe(80);
    await image.dblclick({ position: { x: zoomed.width / 2, y: zoomed.height / 2 } });
    await expect.poll(() => image.boundingBox()).toEqual(initial);
    await image.hover();
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await image.boundingBox())!.height).toBeGreaterThan(initial.height);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(scrollTop);
    await trigger.click();
    await expect.poll(() => image.boundingBox()).toEqual(initial);
    await page.mouse.click(5, 5);
    await expect(viewer).not.toHaveJSProperty('open', true);
    if (context === 'history') await expect(container).toHaveJSProperty('open', true);
  });
}

test('chat_shows_viewer_load_failure_and_can_reopen', async ({ page }) => {
  const items = makeMessages(1, 1, '消息');
  items[0].previewUrl = '/chat/media?gid=1&mid=1&variant=preview';
  items[0].originalUrl = '/chat/media?gid=1&mid=1&variant=original';
  messagesByGid.set(1, items);
  await page.route(/\/chat\/media\?.*variant=original/, route => route.fulfill({
    status: 404, contentType: 'text/plain', body: 'missing',
  }));
  await openChat(page);

  const trigger = page.locator('[data-mid="1"] button.media-preview');
  const dialog = page.locator('.messages-shell dialog.image-viewer');
  await trigger.click();
  await expect(dialog.locator('.image-viewer-state')).toHaveText('原图加载失败，请关闭后重试。');
  await expect(dialog.locator('img')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveJSProperty('open', true);

  await trigger.click();
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(dialog.locator('.image-viewer-state')).toHaveText('原图加载失败，请关闭后重试。');
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
  await expect(first.locator('.bubble a')).toHaveAttribute('href', 'https://example.com/a?b=1');
  await expect(first.locator('.bubble a')).toHaveAttribute('target', '_blank');
  await expect(first.locator('.bubble a')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(first.locator('.bubble a')).toHaveText('https://example.com/a?b=1');
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
  await expect(second.locator('.bubble a')).toHaveAttribute('href', 'https://example.com/x');
  await expect(second.locator('.bubble')).toContainText('结尾 https://example.com/x.');
});

test('chat_renders_file_downloads_and_weibo_share_cards', async ({ page }) => {
  const items = makeMessages(1, 3, '消息');
  items[0].fileUrl = '/chat/media?gid=1&mid=1&variant=file';
  items[0].text = '说明.txt';
  items[1].mediaType = 14;
  items[1].text = '分享微博';
  items[1].urlObjects = [{
    status: { user: { screen_name: '原作者' }, text: `<b>正文</b>${'字'.repeat(120)}完整结尾。` },
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
  await expect(card.locator('.weibo-card-summary')).toHaveText(`正文${'字'.repeat(120)}完整结尾。`);
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

test('chat_polls_new_messages_without_moving_the_viewport', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  messagesByGid.set(1, items);
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');
  const before = await page.locator('.messages').evaluate(element => element.scrollTop);

  items.push(makeMessages(1, 61, '消息')[60]);
  const pill = page.locator('.new-messages-button');
  await expect(pill).toBeVisible({ timeout: 4000 });
  expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(before);
  await expect(page.locator('[data-mid="61"]')).toHaveCount(0);

  await pill.click();
  await expect(page.locator('[data-mid="61"]')).toBeVisible();
  await expect(pill).toBeHidden();
  await expect.poll(() => atBottom(page)).toBe(true);
});

test('chat_scroll_bottom_button_lands_on_the_newest_message', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  messagesByGid.set(1, items);
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');

  items.push(makeMessages(1, 61, '消息')[60]);
  await expect(page.locator('.new-messages-button')).toBeVisible({ timeout: 4000 });
  await page.locator('.scroll-bottom-button').click();
  await expect(page.locator('[data-mid="61"]')).toBeVisible();
  await expect(page.locator('.new-messages-button')).toBeHidden();
});

test('chat_catches_up_after_returning_without_moving_the_viewport', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  messagesByGid.set(1, items);
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');
  const before = await page.locator('.messages').evaluate(element => element.scrollTop);
  pollDelayMs = 2000;

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  items.push(...makeMessages(1, 63, '消息').slice(60));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.locator('.new-messages-button')).toBeVisible({ timeout: 6000 });
  expect(requests.some(value => value.includes('afterMid='))).toBe(true);
  expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(before);
});

test('chat_retries_a_failed_poll_and_recovers', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  messagesByGid.set(1, items);
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');

  messagesStatus.set(1, 500);
  await page.waitForTimeout(1300);
  messagesStatus.delete(1);
  items.push(makeMessages(1, 61, '消息')[60]);
  await expect(page.locator('.new-messages-button')).toBeVisible({ timeout: 9000 });
});

test('chat_filters_groups_locally_without_changing_the_conversation', async ({ page }) => {
  groups = [
    makeGroup(1, '第一群', { latestSenderName: '甲', latestMessage: '早上好' }),
    makeGroup(2, '第二群', { latestSenderName: '乙', latestMessage: '晚上好' }),
  ];
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);

  await expect(page.locator('.group-row .group-preview')).toHaveText(['甲：早上好', '乙：晚上好']);
  const search = page.getByPlaceholder('搜索群聊');
  await search.fill('第二');
  await expect(page.locator('.group-row').first()).toBeHidden();
  await expect(page.locator('.group-row').nth(1)).toBeVisible();
  await expect(page.locator('.message').last()).toContainText('消息 3');
  await expect(page.getByRole('heading', { name: '微博群聊 - 第一群' })).toBeVisible();

  await search.fill('晚上');
  await expect(page.locator('.group-row').nth(1)).toBeVisible();
  await expect(page.locator('.group-row').first()).toBeHidden();

  await search.fill('');
  await expect(page.locator('.group-row').first()).toBeVisible();
  await expect(page.locator('.group-row').nth(1)).toBeVisible();
});

test('chat_refreshes_group_metadata_without_losing_selection', async ({ page }) => {
  groups = [
    makeGroup(1, '第一群', { latestSenderName: '成员A', latestMessage: '早上好', messageCount: 3 }),
    makeGroup(2, '第二群', { latestSenderName: '', latestMessage: '一条消息', messageCount: 2 }),
  ];
  messagesByGid.set(1, makeMessages(1, 5, '消息'));
  await openChat(page);

  await expect(page.locator('.group-row').first()).toContainText('成员A：早上好');
  await expect(page.locator('.group-size')).toContainText('+ 3 条消息');
  await expect(page.locator('.current-message-count')).toHaveText('3');
  await expect(page.locator('.current-message-count')).not.toHaveClass(/size-flash/);
  const before = await page.locator('.messages').evaluate(element => element.scrollTop);

  groups[0] = makeGroup(1, '第一群', { latestSenderName: '成员B', latestMessage: '新内容', messageCount: 7 });
  await expect(page.locator('.group-row').first()).toContainText('成员B：新内容', { timeout: 4000 });
  await expect(page.locator('.group-size')).toContainText('+ 7 条消息');
  await expect(page.locator('.current-message-count')).toHaveText('7');
  // 消息数变化时数字闪一次，与旧页 size-flash 一致。
  await expect(page.locator('.current-message-count')).toHaveClass(/size-flash/);
  await expect(page.locator('.group-row').first()).toHaveAttribute('aria-current', 'true');
  expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(before);
  await expect(page.locator('.message').last()).toContainText('消息 5');
});

test('chat_keeps_the_group_list_when_a_metadata_refresh_fails', async ({ page }) => {
  groups = [makeGroup(1, '第一群', { latestSenderName: '甲', latestMessage: '旧' })];
  messagesByGid.set(1, makeMessages(1, 1, '消息'));
  await openChat(page);
  await expect(page.locator('.group-row')).toHaveCount(1);

  groupsStatus = 503;
  await page.waitForTimeout(1600);
  await expect(page.locator('.group-row')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);

  groups[0] = makeGroup(1, '第一群', { latestSenderName: '甲', latestMessage: '新' });
  groupsStatus = 200;
  await expect(page.locator('.group-row')).toContainText('甲：新', { timeout: 4000 });
});

test('chat_sends_text_on_enter_and_refreshes_immediately', async ({ page }) => {
  const items = makeMessages(1, 60, '消息');
  messagesByGid.set(1, items);
  onSend = () => {
    const extra = makeMessages(1, 61, '消息')[60];
    extra.text = '你好';
    items.push(extra);
  };
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('消息 60');

  const input = page.getByRole('textbox', { name: '输入消息' });
  await input.fill('你好');
  await input.press('Enter');

  await expect.poll(() => sendBodies.length).toBe(1);
  const body = new URLSearchParams(sendBodies[0]);
  expect(body.get('gid')).toBe('1');
  expect(body.get('content')).toBe('你好');
  await expect(input).toHaveValue('');

  const pill = page.locator('.new-messages-button');
  await expect(pill).toBeVisible({ timeout: 3000 });
  await pill.click();
  await expect(page.locator('[data-mid="61"]')).toContainText('你好');
});

test('chat_keeps_shift_enter_for_newlines_and_ignores_blank_text', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  const input = page.getByRole('textbox', { name: '输入消息' });

  await input.fill('第一行');
  await input.press('Shift+Enter');
  await input.type('第二行');
  expect(await input.inputValue()).toBe('第一行\n第二行');
  expect(sendBodies).toHaveLength(0);

  await input.fill('   ');
  await input.press('Enter');
  await page.waitForTimeout(200);
  expect(sendBodies).toHaveLength(0);
});

test('chat_keeps_the_text_when_sending_fails', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  const input = page.getByRole('textbox', { name: '输入消息' });
  const hint = page.locator('.composer-hint');

  sendStatus = 500;
  await input.fill('失败内容');
  await input.press('Enter');
  await expect(hint).toHaveText('发送失败');
  await expect(input).toHaveValue('失败内容');

  sendStatus = 409;
  await input.press('Enter');
  await expect(hint).toHaveText('已发出但本地同步失败');
  await expect(input).toHaveValue('失败内容');
});

test('chat_inserts_emoji_at_the_cursor_and_closes_the_panel', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await page.route('https://face.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f4a51d"/></svg>',
  }));
  await openChat(page);

  const input = page.getByRole('textbox', { name: '输入消息' });
  const trigger = page.getByRole('button', { name: '😊 表情' });
  const panel = page.getByRole('dialog', { name: '表情选择' });
  await input.fill('你好');
  await trigger.click();
  await expect(panel).toBeVisible();

  const doge = panel.locator('button[title="[doge]"]');
  await expect(doge).toHaveCount(1);
  await doge.click();
  await expect(input).toHaveValue('你好[doge]');
  await expect(input).toBeFocused();
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(input).toBeFocused();

  await trigger.click();
  await expect(panel.locator('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(panel).toBeVisible();
  await page.locator('.group-header').click();
  await expect(panel).toBeHidden();
});

test('chat_sends_an_image_attachment_and_refreshes', async ({ page }) => {
  const items = makeMessages(1, 5, '消息');
  messagesByGid.set(1, items);
  onSend = () => {
    const extra = makeMessages(1, 6, '消息')[5];
    extra.text = '新图片';
    items.push(extra);
  };
  await openChat(page);
  await page.locator('input[accept="image/*"]').setInputFiles({
    name: 'pic.png', mimeType: 'image/png', buffer: PNG_BYTES,
  });

  await expect(page.locator('.composer-attachment img')).toHaveCount(1);
  await expect(page.locator('.composer-attachment img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('textbox', { name: '输入消息' })).toHaveCount(0);
  await expect(page.locator('.composer-hint')).toHaveText('按下 Enter 发送图片');
  await expect(page.locator('.composer-attachment')).toBeFocused();

  await page.locator('.composer-attachment').press('Enter');
  await expect.poll(() => mediaSendBodies.length).toBe(1);
  expect(mediaSendBodies[0].url).toBe('/chat/messages/sendImage');
  expect(mediaSendBodies[0].contentType).toContain('multipart/form-data');
  expect(mediaSendBodies[0].body).toContain('pic.png');
  expect(mediaSendBodies[0].body).toContain('name="gid"');
  await expect(page.locator('.composer-attachment')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '输入消息' })).toBeVisible();
  await expect(page.locator('.composer-hint')).toHaveText('按下 Enter 发送内容 / Shift+Enter 换行');

  const pill = page.locator('.new-messages-button');
  await expect(pill).toBeVisible({ timeout: 3000 });
  await pill.click();
  await expect(page.locator('[data-mid="6"]')).toContainText('新图片');
});

test('chat_sends_a_video_attachment', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.locator('input[accept="video/mp4"]').setInputFiles({
    name: 'clip.mp4', mimeType: 'video/mp4', buffer: MP4_BYTES,
  });

  await expect(page.locator('.composer-attachment video')).toHaveCount(1);
  await expect(page.locator('.composer-hint')).toHaveText('按下 Enter 发送视频');
  await page.locator('.composer-attachment').press('Enter');
  await expect.poll(() => mediaSendBodies.length).toBe(1);
  expect(mediaSendBodies[0].url).toBe('/chat/messages/sendVideo');
  expect(mediaSendBodies[0].body).toContain('clip.mp4');
  await expect(page.locator('.composer-attachment')).toHaveCount(0);
});

test('chat_removes_a_pending_attachment', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.locator('input[accept="image/*"]').setInputFiles({
    name: 'pic.png', mimeType: 'image/png', buffer: PNG_BYTES,
  });
  await expect(page.locator('.composer-attachment')).toHaveCount(1);

  await page.getByRole('button', { name: '删除附件' }).click();
  await expect(page.locator('.composer-attachment')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '输入消息' })).toBeVisible();
  await expect(page.locator('.composer-hint')).toHaveText('按下 Enter 发送内容 / Shift+Enter 换行');
});

test('chat_validates_attachment_type_and_size', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  const hint = page.locator('.composer-hint');

  await page.locator('input[accept="image/*"]').setInputFiles({
    name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x'),
  });
  await expect(hint).toHaveText('仅支持图片文件。');
  await expect(page.locator('.composer-attachment')).toHaveCount(0);

  await page.locator('input[accept="image/*"]').setInputFiles({
    name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(hint).toHaveText('图片不能超过 20MB。');

  await page.locator('input[accept="video/mp4"]').setInputFiles({
    name: 'clip.mp4', mimeType: 'image/png', buffer: PNG_BYTES,
  });
  await expect(hint).toHaveText('仅支持 MP4 视频文件。');
});

test('chat_keeps_the_attachment_when_media_send_fails', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.locator('input[accept="image/*"]').setInputFiles({
    name: 'pic.png', mimeType: 'image/png', buffer: PNG_BYTES,
  });
  mediaSendStatus = 500;
  await page.locator('.composer-attachment').press('Enter');
  await expect(page.locator('.composer-hint')).toHaveText('附件发送失败');
  await expect(page.locator('.composer-attachment')).toHaveCount(1);
});

test('chat_pastes_an_image_into_the_attachment_flow', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  // 群选中前编辑器是禁用的，粘贴守卫会直接跳过。
  await expect(page.getByRole('textbox', { name: '输入消息' })).toBeEnabled();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'paste.png', { type: 'image/png' }));
    const textarea = document.querySelector('.composer textarea') as HTMLTextAreaElement;
    textarea.focus();
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    textarea.dispatchEvent(event);
  });

  await expect(page.locator('.composer-attachment img')).toHaveCount(1);
  await expect(page.locator('.composer-hint')).toHaveText('按下 Enter 发送图片');
});

test('chat_loads_attitudes_only_after_enabling_the_toggle', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 5, '消息'));
  attitudesPayload = {
    '1': [{ name: 'doge', count: 3 }, { name: '赞', count: 1, selected: true }],
    '2': [{ name: '未知表情', count: 2 }],
    '3': [{ name: 'doge', count: 0 }],
  };
  await page.route('https://face.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f4a51d"/></svg>',
  }));
  await openChat(page);

  const toggle = page.locator('.attitudes-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(requests.some(value => value.includes('/chat/attitudes'))).toBe(false);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const attitudeRequest = requests.find(value => value.includes('/chat/attitudes'));
  expect(attitudeRequest).toBeTruthy();
  const query = new URLSearchParams(attitudeRequest!.split('?')[1]);
  expect(query.get('gid')).toBe('1');
  expect(query.get('mids')).toBe('1,2,3,4,5');

  const chips = page.locator('[data-mid="1"] .attitude-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('title', 'doge');
  await expect(chips.first().locator('img')).toHaveAttribute('alt', 'doge');
  await expect(chips.nth(1)).toHaveClass(/selected/);
  await expect(page.locator('[data-mid="2"] .attitude-chip')).toContainText('未知表情');
  await expect(page.locator('[data-mid="3"] .attitude-chip')).toHaveCount(0);
});

test('chat_persists_attitudes_and_stops_requesting_after_turning_it_off', async ({ page }) => {
  const items = makeMessages(1, 5, '消息');
  messagesByGid.set(1, items);
  attitudesPayload = { '1': [{ name: 'doge', count: 2 }] };
  await page.route('https://face.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
  }));
  await openChat(page);

  const toggle = page.locator('.attitudes-toggle');
  await toggle.click();
  await expect(page.locator('[data-mid="1"] .attitude-chip')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('[data-mid="1"] .attitude-chip')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-mid="1"] .attitude-chip')).toHaveCount(1);
  const requestCount = requests.filter(value => value.includes('/chat/attitudes')).length;
  items.push(makeMessages(1, 6, '消息')[5]);
  await expect(page.locator('.new-messages-button')).toBeVisible({ timeout: 4000 });
  await page.waitForTimeout(400);
  expect(requests.filter(value => value.includes('/chat/attitudes')).length).toBe(requestCount);
});

test('chat_loads_attitudes_for_new_messages', async ({ page }) => {
  const items = makeMessages(1, 5, '消息');
  messagesByGid.set(1, items);
  attitudesPayload = { '6': [{ name: 'doge', count: 1 }] };
  await page.route('https://face.t.sinajs.cn/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
  }));
  await openChat(page);
  await page.locator('.attitudes-toggle').click();

  items.push(makeMessages(1, 6, '消息')[5]);
  const pill = page.locator('.new-messages-button');
  await expect(pill).toBeVisible({ timeout: 4000 });
  await expect.poll(() => requests.some(value => value.includes('mids=6'))).toBe(true);
  await pill.click();
  await expect(page.locator('[data-mid="6"] .attitude-chip')).toHaveCount(1);
});

test('chat_keeps_messages_when_attitudes_fail', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  attitudesStatus = 500;
  await openChat(page);
  await page.locator('.attitudes-toggle').click();
  await page.waitForTimeout(300);

  await expect(page.locator('.message').last()).toContainText('消息 3');
  await expect(page.locator('.attitude-chip')).toHaveCount(0);
});

test('chat_opens_history_with_shanghai_defaults', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(dialog.getByRole('heading', { name: '聊天记录 - 第一群' })).toBeVisible();

  const today = shanghaiToday();
  const anchor = new Date(`${today}T12:00:00`);
  await expect(dialog.getByLabel('开始日期')).toHaveValue(localDateValue(calendarMonthsAgo(anchor, 3)));
  await expect(dialog.getByLabel('结束日期')).toHaveValue(today);
  await expect(dialog.locator('.history-empty')).toHaveText('设置筛选条件后点击查询');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveJSProperty('open', true);
});

test('chat_searches_history_with_shanghai_bounds_and_highlights', async ({ page }) => {
  const items = makeMessages(1, 5, '消息');
  items[0].text = '这里有关键词 Alpha';
  messagesByGid.set(1, items);
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await dialog.getByLabel('开始日期').fill('2026-08-05');
  await dialog.getByLabel('结束日期').fill('2026-08-07');
  await dialog.getByLabel('内容').fill('关键词');
  await dialog.getByRole('button', { name: '🔍 查询' }).click();

  await expect(dialog.locator('.history-result')).toHaveCount(1);
  const request = requests.find(value => value.includes('/chat/messages?') && value.includes('keyword='));
  expect(request).toBeTruthy();
  const params = new URLSearchParams(request!.split('?')[1]);
  expect(params.get('gid')).toBe('1');
  expect(params.get('page')).toBe('1');
  expect(params.get('size')).toBe('20');
  expect(params.get('start')).toBe('2026-08-05 00:00:00');
  expect(params.get('end')).toBe('2026-08-07 23:59:59');
  expect(params.get('keyword')).toBe('关键词');

  await expect(dialog.locator('.history-result mark')).toHaveText('关键词');
  await expect(dialog.locator('.history-result-summary')).toContainText('这里有关键词');
  await expect(dialog.locator('.history-pagination')).toContainText('第 1 / 1 页，共 1 条');

  const styles = await dialog.evaluate(element => ({
    title: getComputedStyle(element.querySelector('#history-title')!).fontSize,
    label: getComputedStyle(element.querySelector('.history-filters label')!).fontSize,
    summary: getComputedStyle(element.querySelector('.history-result-summary')!).fontSize,
    pagination: getComputedStyle(element.querySelector('.history-pagination button')!).fontSize,
  }));
  expect(styles.title).toBe('18px');
  expect(styles.label).toBe('13px');
  expect(styles.summary).toBe('15px');
  expect(styles.pagination).toBe('15px');
});

test('chat_pages_history_results_and_labels_media', async ({ page }) => {
  const items = makeMessages(1, 25, '消息');
  items[1].text = '分享图片';
  items[1].previewUrl = '/chat/media?gid=1&mid=2&variant=preview';
  items[2].text = '分享视频';
  items[2].previewUrl = '/chat/media?gid=1&mid=3&variant=preview';
  items[2].videoUrl = '/chat/media?gid=1&mid=3&variant=video';
  items[3].mediaType = 14;
  items[3].urlObjects = [{ status: { user: { screen_name: '作者' }, text: '卡片正文' }, url_ori: 'https://weibo.com/1/x' }];
  messagesByGid.set(1, items);
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await dialog.getByLabel('开始日期').fill('2026-08-05');
  await dialog.getByLabel('结束日期').fill('2026-08-07');
  await dialog.getByRole('button', { name: '🔍 查询' }).click();

  await expect(dialog.locator('.history-result')).toHaveCount(20);
  const summaries = dialog.locator('.history-result-summary');
  await expect(summaries.nth(1)).toHaveText('[图片]');
  await expect(summaries.nth(2)).toHaveText('[视频]');
  await expect(summaries.nth(3)).toHaveText('[微博]');
  await expect(dialog.locator('.history-pagination')).toContainText('第 1 / 2 页，共 25 条');

  const previous = dialog.getByRole('button', { name: '⬅️ 上一页' });
  const next = dialog.getByRole('button', { name: '下一页 ➡️' });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(dialog.locator('.history-result')).toHaveCount(5);
  await expect(dialog.locator('.history-pagination')).toContainText('第 2 / 2 页，共 25 条');
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  const pageTwo = requests.filter(value => value.includes('/chat/messages?') && value.includes('page=2')).pop();
  expect(new URLSearchParams(pageTwo!.split('?')[1]).get('start')).toBe('2026-08-05 00:00:00');
});

test('chat_history_pagination_keeps_results_while_loading', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 25, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await dialog.getByLabel('开始日期').fill('2026-08-05');
  await dialog.getByLabel('结束日期').fill('2026-08-07');
  await dialog.getByRole('button', { name: '🔍 查询' }).click();
  await expect(dialog.locator('.history-result')).toHaveCount(20);

  holdPredicate = url => url.pathname === '/chat/messages' && url.searchParams.get('page') === '2';
  await dialog.getByRole('button', { name: '下一页 ➡️' }).click();
  await expect.poll(() => held.length).toBe(1);
  // 加载下一页期间保留第一页，列表不闪成空白。
  await expect(dialog.locator('.history-result')).toHaveCount(20);
  await expect(dialog.locator('.history-empty')).toHaveCount(0);
  releaseHeld();
  await expect(dialog.locator('.history-result')).toHaveCount(5);
});

test('chat_opens_history_context_and_pages_both_ways', async ({ page }) => {
  const contextItems = makeMessages(1, 120, '消息');
  for (let mid = 50; mid <= 59; mid += 1) {
    contextItems[mid - 1].mediaType = 1;
    contextItems[mid - 1].previewUrl = `/chat/media?gid=1&mid=${mid}&variant=preview`;
  }
  messagesByGid.set(1, contextItems);
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await dialog.getByLabel('开始日期').fill('2026-08-05');
  await dialog.getByLabel('结束日期').fill('2026-08-07');
  await dialog.getByLabel('内容').fill('消息 60');
  await dialog.getByRole('button', { name: '🔍 查询' }).click();
  await expect(dialog.locator('.history-result')).toHaveCount(1);
  await dialog.locator('.history-result').click();

  await expect(dialog.locator('.history-context')).toBeVisible();
  await expect(dialog.locator('[data-mid="60"]')).toHaveClass(/target-message/);
  const targetLayout = () => dialog.evaluate(element => {
    const container = element.querySelector('.history-messages') as HTMLElement;
    const target = element.querySelector('[data-mid="60"]') as HTMLElement;
    const cr = container.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    return {
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      relTop: tr.top - cr.top,
      targetHeight: tr.height,
    };
  });
  const centered = (layout: { relTop: number; targetHeight: number; clientHeight: number }) =>
    Math.abs(layout.relTop + layout.targetHeight / 2 - layout.clientHeight / 2);

  const initial = await targetLayout();
  expect(initial.scrollTop).toBeGreaterThan(0);
  expect(centered(initial)).toBeLessThan(80);

  // 目标上方的图片加载会改变高度，等待后仍应保持居中。
  await page.waitForTimeout(1200);
  const settled = await targetLayout();
  expect(centered(settled)).toBeLessThan(80);

  expect(requests.filter(value => value.includes('beforeMid=60')).length).toBe(1);
  expect(requests.filter(value => value.includes('afterMid=60')).length).toBe(1);
  await expect(dialog.locator('.history-edge-state').first()).toHaveText('向上滚动加载更早消息');
  await expect(dialog.locator('.history-edge-state').last()).toHaveText('向下滚动加载更新消息');

  await dialog.locator('.history-messages').evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => requests.filter(value =>
    value.includes('beforeMid=') && !value.includes('beforeMid=60')).length).toBe(1);

  await dialog.getByRole('button', { name: '🚩 返回搜索结果' }).click();
  await expect(dialog.locator('.history-result')).toHaveCount(1);
  await expect(dialog.locator('.history-pagination')).toContainText('第 1 / 1 页，共 1 条');
});

test('chat_closes_history_from_the_titlebar_button', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesByGid.set(2, makeMessages(2, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await expect(dialog).toHaveJSProperty('open', true);
  // 模态窗口会遮住侧栏；这里只验证关闭按钮与切群逻辑本身不会留下打开的窗口。
  await dialog.getByRole('button', { name: '关闭聊天记录' }).click();
  await expect(dialog).not.toHaveJSProperty('open', true);
});

test('chat_syncs_history_from_the_dialog', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 5, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  const today = shanghaiToday();
  const anchor = new Date(`${today}T12:00:00`);
  const expectedDate = localDateValue(calendarMonthsAgo(anchor, 24));
  await expect(dialog.getByLabel('同步历史至')).toHaveValue(expectedDate);

  await dialog.getByRole('button', { name: '⬇️ 同步历史' }).click();
  await expect.poll(() => requests.filter(value => value.includes('/chat/since?')).length).toBe(1);
  const request = requests.find(value => value.includes('/chat/since?'))!;
  const params = new URLSearchParams(request.split('?')[1]);
  expect(params.get('gid')).toBe('1');
  expect(params.get('sinceTime')).toBe(`${expectedDate} 00:00:00`);
  expect(params.has('beforeMid')).toBe(false);
  await expect(dialog.locator('.history-empty')).toHaveText('已开始同步更早的历史消息，稍后请手动刷新查看。');
  await expect(dialog.getByRole('button', { name: '⬇️ 同步历史' })).toBeEnabled();
});

test('chat_validates_the_sync_date_and_reports_failure', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');

  await dialog.getByLabel('同步历史至').fill('');
  await dialog.getByRole('button', { name: '⬇️ 同步历史' }).click();
  await expect(dialog.locator('.history-empty')).toHaveText('请先选择要同步到的历史日期。');
  expect(requests.some(value => value.includes('/chat/since'))).toBe(false);

  await dialog.getByLabel('同步历史至').fill('2026-08-05');
  syncStatus = 500;
  await dialog.getByRole('button', { name: '⬇️ 同步历史' }).click();
  await expect(dialog.locator('.history-empty')).toHaveText('同步历史请求失败，请稍后重试。');
});

test('chat_disables_sync_while_in_flight_and_hides_results', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 25, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const dialog = page.locator('dialog.history-dialog');
  await dialog.getByLabel('开始日期').fill('2026-08-05');
  await dialog.getByLabel('结束日期').fill('2026-08-07');
  await dialog.getByRole('button', { name: '🔍 查询' }).click();
  await expect(dialog.locator('.history-result')).toHaveCount(20);

  holdPredicate = url => url.pathname === '/chat/since';
  await dialog.getByRole('button', { name: '⬇️ 同步历史' }).click();
  await expect.poll(() => held.length).toBe(1);
  await expect(dialog.getByRole('button', { name: '⬇️ 同步历史' })).toBeDisabled();
  await expect(dialog.locator('.history-empty')).toHaveText('同步中…');
  await expect(dialog.locator('.history-result')).toHaveCount(0);

  releaseHeld();
  await expect(dialog.locator('.history-empty')).toHaveText('已开始同步更早的历史消息，稍后请手动刷新查看。');
  await expect(dialog.getByRole('button', { name: '⬇️ 同步历史' })).toBeEnabled();
});

test('chat_shows_login_expired_and_pauses_polling', async ({ page }) => {
  loginValid = false;
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);

  const panel = page.locator('.login-expired');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.panel-state').first()).toHaveText('登录已失效');
  await expect(panel.getByRole('button', { name: '📱 扫码登录' })).toBeVisible();
  await expect(page.locator('.message')).toHaveCount(3);

  await page.waitForTimeout(300);
  const cursorCount = requests.filter(value => value.includes('/chat/messages/cursor')).length;
  const groupsCount = requests.filter(value => value === 'GET /chat/groups').length;
  await page.waitForTimeout(1400);
  expect(requests.filter(value => value.includes('/chat/messages/cursor')).length).toBe(cursorCount);
  expect(requests.filter(value => value === 'GET /chat/groups').length).toBe(groupsCount);
});

test('chat_scans_qr_and_reinitializes', async ({ page }) => {
  loginValid = false;
  qrHold = true;
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await expect(page.locator('.login-expired')).toBeVisible();

  await page.getByRole('button', { name: '📱 扫码登录' }).click();
  await expect.poll(() => held.length).toBe(1);
  const button = page.locator('.login-expired button');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('📱 扫码中…');

  await expect(page.locator('.login-expired img')).toBeVisible({ timeout: 6000 });
  const groupsBefore = requests.filter(value => value === 'GET /chat/groups').length;
  loginValid = true;
  releaseHeld();
  await expect(page.locator('.login-expired')).toHaveCount(0);
  await expect.poll(() => requests.filter(value => value === 'GET /chat/groups').length).toBeGreaterThan(groupsBefore);
  await expect(page.locator('.message')).toHaveCount(3);

  const cursorBefore = requests.filter(value => value.includes('/chat/messages/cursor')).length;
  await page.waitForTimeout(1500);
  expect(requests.filter(value => value.includes('/chat/messages/cursor')).length).toBeGreaterThan(cursorBefore);
});

test('chat_reports_qr_login_failure_and_restores_the_button', async ({ page }) => {
  loginValid = false;
  qrStatus = 500;
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);

  const panel = page.locator('.login-expired');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '📱 扫码登录' }).click();
  await expect(panel.locator('.panel-state').nth(1)).toHaveText('扫码登录失败，请重新扫码。');
  await expect(panel.getByRole('button', { name: '📱 扫码登录' })).toBeEnabled();
  await expect(panel.locator('.qr-loading')).toHaveText('暂无二维码');
});

test('chat_does_not_show_login_panel_when_valid', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await expect(page.locator('.message')).toHaveCount(3);
  await expect(page.locator('.login-expired')).toHaveCount(0);
});

test('chat_opens_analysis_with_defaults_and_history', async ({ page }) => {
  analysisItems = [
    { id: 3, date: '2026-10-17', promptPreview: '总结今天群聊', messageCount: 12, createdAt: '2026-10-17 09:00' },
    { id: 2, date: '2026-10-16', promptPreview: '昨天讨论了什么', messageCount: 7, createdAt: '2026-10-16 21:30' },
  ];
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(dialog.getByRole('heading', { name: '群聊分析 - 第一群' })).toBeVisible();
  await expect(dialog.getByLabel('分析日期')).toHaveValue(shanghaiToday());
  await expect(dialog.getByLabel('提示词')).toHaveValue('请总结今天群聊的主要讨论话题和参与者');

  const request = requests.find(value => value.includes('/chat/analyses?') && value.includes('page=1'));
  expect(request).toBeTruthy();
  const params = new URLSearchParams(request!.split('?')[1]);
  expect(params.get('gid')).toBe('1');
  expect(params.get('size')).toBe('20');
  await expect(dialog.locator('.analysis-item')).toHaveCount(2);
  await expect(dialog.locator('.analysis-item').first()).toContainText('12 条');
  await expect(dialog.locator('.analysis-pagination')).toContainText('第 1 / 1 页，共 2 条');
});

test('chat_shows_analysis_detail_with_markdown', async ({ page }) => {
  analysisItems = [{ id: 5, date: '2026-10-17', promptPreview: '总结', messageCount: 12, createdAt: '2026-10-17 09:00' }];
  analysisDetail = {
    ...analysisDetail, id: 5,
    prompt: '分析下 tk 说的是哪个微博【这就是为什么我很讨厌别人把我在群里的话单独摘出来发到别的地方。因为没看到上下文的人不会知道我为什么那样说。】'.repeat(3),
    result: `## 结论\n\n- 要点一\n\n> ${'这是一段很长的引用文字，'.repeat(20)}`,
  };
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await dialog.locator('.analysis-item').click();

  await expect(dialog.locator('.analysis-detail-meta')).toContainText('分析日期：');
  await expect(dialog.locator('.analysis-detail-meta')).toContainText('12 条');
  await expect(dialog.locator('.analysis-detail-meta')).toContainText('2026-10-17 09:00');
  await expect(dialog.locator('.analysis-detail-content h2')).toHaveText('结论');
  await expect(dialog.getByRole('button', { name: '⬇️ 下载 Markdown' })).toBeEnabled();
  await expect(dialog.locator('.analysis-meta-copy')).toBeVisible();
  await expect.poll(() => requests.some(value => value.includes('/chat/analyses/5'))).toBe(true);

  const layout = await dialog.evaluate(element => {
    const meta = element.querySelector('.analysis-detail-meta')!;
    const content = element.querySelector('.analysis-detail-content')!;
    const detail = element.querySelector('.analysis-detail')!;
    const label = element.querySelector('.analysis-meta-label')!;
    return {
      metaOverflow: meta.scrollWidth - meta.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      detailOverflow: detail.scrollWidth - detail.clientWidth,
      dialogOverflow: element.scrollWidth - element.clientWidth,
      labelLines: label.getClientRects().length,
    };
  });
  expect(layout.metaOverflow).toBe(0);
  expect(layout.contentOverflow).toBe(0);
  expect(layout.detailOverflow).toBe(0);
  expect(layout.dialogOverflow).toBe(0);
  expect(layout.labelLines).toBe(1);
});

test('chat_streams_analysis_and_shows_done', async ({ page }) => {
  analysisStreamDelay = 600;
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await dialog.getByLabel('提示词').fill('汇总今日话题');
  await dialog.getByRole('button', { name: '🤖 分析' }).click();

  const pending = dialog.locator('.analysis-pending');
  await expect(pending).toHaveText('正在分析，请稍候…');
  const spinner = await pending.evaluate(element => getComputedStyle(element, '::before').animationName);
  expect(spinner).toBe('analysis-spin');
  await expect(dialog.getByRole('button', { name: /分析中/ })).toBeDisabled();
  await expect(dialog.locator('.analysis-detail-content')).toContainText('要点一', { timeout: 3000 });
  await expect.poll(() => analysisStreamBodies.length).toBe(1);
  const body = new URLSearchParams(analysisStreamBodies[0]);
  expect(body.get('gid')).toBe('1');
  expect(body.get('date')).toBe(shanghaiToday());
  expect(body.get('prompt')).toBe('汇总今日话题');

  await expect(dialog.locator('.analysis-detail-meta')).toContainText('12 条', { timeout: 4000 });
  await expect(dialog.locator('.analysis-detail-content h2')).toHaveText('结论');
  await expect(dialog.getByRole('button', { name: '⬇️ 下载 Markdown' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '🤖 分析' })).toBeEnabled();
});

test('chat_reports_analysis_stream_error', async ({ page }) => {
  analysisStreamError = '模型超时';
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await dialog.getByRole('button', { name: '🤖 分析' }).click();

  await expect(dialog.locator('.analysis-error')).toHaveText('分析失败：模型超时');
  await expect(dialog.getByRole('button', { name: '🤖 分析' })).toBeEnabled();
});

test('chat_pages_analysis_history_and_reports_empty', async ({ page }) => {
  analysisItems = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, date: '2026-10-17', promptPreview: `提示 ${index + 1}`,
    messageCount: index, createdAt: '2026-10-17 09:00',
  }));
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await expect(dialog.locator('.analysis-item')).toHaveCount(20);
  await expect(dialog.locator('.analysis-pagination')).toContainText('第 1 / 2 页，共 25 条');
  await dialog.getByRole('button', { name: '下一页 ➡️' }).click();
  await expect(dialog.locator('.analysis-item')).toHaveCount(5);
  await expect(dialog.locator('.analysis-pagination')).toContainText('第 2 / 2 页，共 25 条');

  analysisItems = [];
  await dialog.getByRole('button', { name: '关闭群聊分析' }).click();
  await expect(dialog).not.toHaveJSProperty('open', true);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  await expect(dialog.locator('.analysis-feedback')).toHaveText('暂无历史分析记录。');
});

test('chat_has_no_return_celebration_even_with_saved_settings', async ({ page }) => {
  const items = makeMessages(1, 3, '消息');
  messagesByGid.set(1, items);
  await page.addInitScript(() => {
    localStorage.setItem('weibo-chat:celebration-roster', JSON.stringify({
      '1': { '101': { name: '成员1', avatar: '', interval: 1 } },
    }));
  });
  await openChat(page);
  await expect(page.locator('.message')).toHaveCount(3);
  await expect(page.locator('[class*="celebration"]')).toHaveCount(0);
  await expect(page.getByTitle('设置回归庆祝')).toHaveCount(0);
  items.push({ ...items[0], mid: 999, createdAt: items[2].createdAt + 120000, text: '新的消息' });
  await expect(page.locator('.new-messages-button')).toBeVisible();
  await page.getByRole('button', { name: '有新消息', exact: true }).click();
  await expect(page.locator('.messages')).toContainText('新的消息');
  await expect(page.locator('[class*="celebration"]')).toHaveCount(0);
  expect(requests.some(request => request.includes('/chat/assets/monster/'))).toBe(false);
});

test('chat_uses_one_close_button_style_across_windows', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);

  const read = (selector: string) => page.locator(selector).evaluate(button => {
    const style = getComputedStyle(button);
    const icon = getComputedStyle(button, '::before');
    return {
      width: style.width,
      height: style.height,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      background: style.backgroundImage,
      icon: icon.content,
      iconSize: icon.width,
    };
  });

  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const history = await read('.history-close');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.history-dialog')).not.toHaveJSProperty('open', true);

  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const analysis = await read('.analysis-close');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.analysis-dialog')).not.toHaveJSProperty('open', true);

  expect(history).toEqual(analysis);
});

test('chat_toggles_immersive_reading', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await expect(page.locator('.conversation')).not.toHaveClass(/immersive/);

  await page.getByRole('button', { name: '进入沉浸阅读' }).click();
  await expect(page.locator('.conversation')).toHaveClass(/immersive/);
  await expect(page.locator('.group-header')).toBeHidden();
  await expect(page.locator('.composer')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('weibo-chat:immersive'))).toBe('1');

  await page.reload();
  await expect(page.locator('.conversation')).toHaveClass(/immersive/);
  await page.getByRole('button', { name: '退出沉浸阅读' }).click();
  await expect(page.locator('.conversation')).not.toHaveClass(/immersive/);
  expect(await page.evaluate(() => localStorage.getItem('weibo-chat:immersive'))).toBe('0');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 900, height: 560 }]) {
test(`chat_opens_the_dream_game_from_a_member_avatar_at_${viewport.width}`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesByGid.get(1)![0].senderId = 1176117365;
  await openChat(page);
  await page.locator('[data-sender-id="1176117365"]').first().hover();

  const popover = page.locator('.dream-popover');
  await expect(popover).toBeVisible({ timeout: 6000 });
  await expect(popover.getByRole('heading', { name: '盗梦空间' })).toBeVisible();
  await expect(popover).toContainText('是否进入盗梦空间？');
  await popover.getByRole('button', { name: '🌀 进入盗梦空间' }).click();

  const dialog = page.locator('dialog.dream-dialog');
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /\/chat\/dream\/1176117365\.html\?v=\d+/);
  const geometry = await dialog.evaluate(element => {
    const frame = element.querySelector('iframe')!.getBoundingClientRect();
    const stage = element.querySelector('.dream-stage')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return { frameWidth: frame.width, frameHeight: frame.height, bottomGap: bounds.bottom - frame.bottom,
      stageHeight: stage.height, dialogHeight: bounds.height };
  });
  expect(geometry.frameHeight).toBeCloseTo(geometry.frameWidth * 480 / 512, 0);
  expect(Math.abs(geometry.bottomGap - 2)).toBeLessThanOrEqual(1);
  expect(geometry.stageHeight).toBeCloseTo(geometry.frameHeight, 0);
  await expect(dialog.locator('iframe').contentFrame().locator('#game')).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('dream-window.png') });
  await dialog.getByRole('button', { name: '关闭盗梦空间' }).click();
  await expect(dialog).not.toHaveJSProperty('open', true);
  await expect.poll(() => dialog.locator('iframe').getAttribute('src')).toBe('about:blank');
});
}

test('chat_has_a_keyboard_accessible_switch_to_the_formal_post_page', async ({ page }) => {
  await openChat(page);
  const control = page.getByRole('link', { name: '切换到本地微博', exact: true });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute('href', '/post/index.html');
  expect(await control.evaluate(element => getComputedStyle(element, '::before').backgroundImage)).toContain('svg');
  await page.route('**/post/index.html', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<html><body>本地微博</body></html>',
  }));
  await control.focus();
  await control.press('Enter');
  await expect(page).toHaveURL(/\/post\/index\.html$/);
});

test('chat_opens_a_member_weibo_profile_from_the_avatar', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  const avatar = page.locator('.message-avatar').first();
  await expect(avatar).toHaveAttribute('href', 'https://weibo.com/u/101');
  await expect(avatar).toHaveAttribute('target', '_blank');
  await expect(avatar).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(avatar).toHaveAttribute('aria-label', '查看成员1的微博主页');
});

test('chat_skips_avatars_without_a_dream_page', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.locator('[data-sender-id="102"]').first().hover();
  await page.waitForTimeout(3500);
  await expect(page.locator('.dream-popover')).toHaveCount(0);
});

test('chat_switch_group_ignores_the_late_response_of_the_previous_group', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '旧群'));
  messagesByGid.set(2, makeMessages(2, 3, '新群'));
  holdPredicate = url => url.searchParams.get('gid') === '1';
  await openChat(page);

  await expect(page.locator('.messages').getByRole('status')).toHaveText('正在加载消息……');
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
    const composer = getComputedStyle(document.querySelector('.composer textarea')!);
    const search = getComputedStyle(document.querySelector('.search-box input')!);
    const historyButton = document.querySelector('.composer-tools .history-open')!.getBoundingClientRect();
    const videoButton = document.querySelectorAll('.composer-tools button')[2].getBoundingClientRect();
    const lastButton = document.querySelector('.composer-tools button:last-of-type')!.getBoundingClientRect();
    const tools = document.querySelector('.composer-tools')!.getBoundingClientRect();
    return {
      titlebarHeight: titlebar.height,
      panelWidth: panel.width,
      bubbleRadius: bubble.borderRadius,
      bubbleBorder: bubble.borderTopColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      overflowY: getComputedStyle(messages).overflowY,
      scrollWidth: document.documentElement.scrollWidth,
      composerFontFamily: composer.fontFamily,
      composerFontSize: composer.fontSize,
      searchFontFamily: search.fontFamily,
      historyGap: historyButton.left - videoButton.right,
      lastButtonOffsetRight: tools.right - lastButton.right,
    };
  });

  expect(metrics.titlebarHeight).toBe(38);
  expect(metrics.panelWidth).toBe(280);
  expect(metrics.bubbleRadius).toBe('4px');
  expect(metrics.bubbleBorder).toBe('rgb(167, 189, 205)');
  expect(metrics.bodyBackground).toBe('rgb(185, 216, 242)');
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollWidth).toBeLessThanOrEqual(900);
  // 输入框与搜索框沿用页面字体，不使用浏览器默认的等宽字体。
  expect(metrics.composerFontFamily).toContain('Tahoma');
  expect(metrics.composerFontSize).toBe('15px');
  expect(metrics.searchFontFamily).toContain('Tahoma');
  // 聊天记录与分析按钮靠右；聊天记录不再紧贴视频按钮，最右按钮与行右内边距一致。
  expect(metrics.historyGap).toBeGreaterThan(40);
  expect(metrics.lastButtonOffsetRight).toBeGreaterThanOrEqual(0);
  expect(metrics.lastButtonOffsetRight).toBeLessThanOrEqual(12);
});

test('chat_trims_message_and_height_caches_to_the_legacy_limit', () => {
  const items = makeMessages(1, 20001, '压力消息');
  const messages = new Map(items.map(item => [item.mid, item]));
  const heights = new Map(items.map(item => [item.mid, 96]));
  const retained = trimMessageCache(items, messages, heights);
  expect(retained).toHaveLength(18000);
  expect(retained[0].mid).toBe(2002);
  expect(retained[retained.length - 1].mid).toBe(20001);
  expect(messages.size).toBe(18000);
  expect(heights.size).toBe(18000);
  expect(messages.has(1)).toBe(false);
  expect(heights.has(1)).toBe(false);
});

test('chat_does_not_trim_before_exceeding_the_legacy_limit', () => {
  const items = makeMessages(1, 20000, '压力消息');
  const messages = new Map(items.map(item => [item.mid, item]));
  const heights = new Map([[1, 96]]);
  expect(trimMessageCache(items, messages, heights)).toBe(items);
  expect(messages.size).toBe(20000);
  expect(heights.get(1)).toBe(96);
});

test('chat_trims_after_a_large_catch_up_and_rejects_late_older_messages', async ({ page }) => {
  test.setTimeout(60000);
  messagesByGid.set(1, makeMessages(1, 100, '压力消息'));
  await openChat(page);
  await expect(page.locator('.message').last()).toContainText('压力消息 100');
  holdPredicate = url => url.pathname === '/chat/messages/cursor' && url.searchParams.has('beforeMid');
  await page.locator('.messages').evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => held.length).toBe(1);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    messagesByGid.set(1, makeMessages(1, 5000, '压力消息'));
    const firstCatchUp = page.waitForResponse(response => response.url().includes('afterMid=4950'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await firstCatchUp;
    await page.getByRole('button', { name: '滚到最新消息', exact: true }).click();
    await expect(page.locator('.message').last()).toContainText('压力消息 5000');
    await expect.poll(() => atBottom(page)).toBe(true);
    const anchor = await page.locator('.messages').evaluate(container => {
      const top = container.getBoundingClientRect().top;
      const element = [...container.querySelectorAll<HTMLElement>('[data-mid]')]
        .find(item => item.getBoundingClientRect().bottom > top)!;
      return { mid: element.dataset.mid!, top: element.getBoundingClientRect().top };
    });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    messagesByGid.set(1, makeMessages(1, 20101, '压力消息'));
    const completed = page.waitForResponse(response => response.url().includes('afterMid=20100'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await completed;
    await expect(page.getByRole('status').filter({ hasText: '收到 1 条新消息' })).toHaveText('收到 1 条新消息');
    const anchorTop = await page.locator(`[data-mid="${anchor.mid}"]`).evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(anchorTop - anchor.top)).toBeLessThanOrEqual(1);
    releaseHeld();
    await page.getByRole('button', { name: '滚到最新消息', exact: true }).click();
    await expect(page.locator('.message').last()).toContainText('压力消息 20101');
    await page.locator('.messages').evaluate(element => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('.message').first()).toHaveAttribute('data-mid', '2101');
    expect(await page.locator('.message').count()).toBeLessThanOrEqual(360);
    expect(requests.filter(request => request.includes('beforeMid=')).length).toBe(1);
  } finally {
    releaseHeld();
  }
});

test('chat_announces_new_arrivals_without_making_the_message_list_live', async ({ page }) => {
  const items = makeMessages(1, 3, '消息');
  messagesByGid.set(1, items);
  await openChat(page);
  await expect(page.locator('.message')).toHaveCount(3);
  items.push({ ...items[0], mid: 999, createdAt: messageTime(999), text: '第一条新消息' });
  const announcement = page.getByRole('status').filter({ hasText: '收到 1 条新消息' });
  await expect(announcement).toHaveText('收到 1 条新消息');
  await expect(announcement).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.messages')).not.toHaveAttribute('aria-live');
  const repeated = announcement.evaluate(element => new Promise<string>(resolve => {
    const finish = (value: string) => { observer.disconnect(); clearTimeout(timer); resolve(value); };
    const observer = new MutationObserver(() => finish(element.textContent ?? ''));
    observer.observe(element, { subtree: true, childList: true, characterData: true });
    const timer = setTimeout(() => finish('没有新的通报'), 4000);
  }));
  items.push({ ...items[0], mid: 1000, createdAt: messageTime(1000), text: '第二条新消息' });
  expect(await repeated).toBe('收到 1 条新消息');
});

test('chat_respects_reduced_motion_for_login_feedback', async ({ page }) => {
  loginValid = false;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openChat(page);
  const state = page.locator('.login-expired .panel-state').first();
  await expect(state).toBeVisible();
  const duration = await state.evaluate(element => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThan(0.001);
});

test('chat_business_401_opens_login_recovery', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesStatus.set(1, 401);
  loginValid = true;
  await openChat(page);
  await expect(page.locator('.messages-state')).toContainText('本地消息暂时不可用');
  await expect(page.getByRole('button', { name: '📱 扫码登录' })).toBeVisible({ timeout: 1500 });
});

test('chat_does_not_let_a_late_valid_status_hide_a_business_401', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/weibo/login/status', async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true}' });
  });
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesStatus.set(1, 401);
  await openChat(page);
  await expect(page.getByRole('button', { name: '📱 扫码登录' })).toBeVisible();
  const response = page.waitForResponse(item => item.url().endsWith('/weibo/login/status'));
  release();
  await response;
  await page.waitForTimeout(150);
  await expect(page.getByRole('button', { name: '📱 扫码登录' })).toBeVisible();
});

test('chat_opens_login_recovery_after_a_send_401', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  sendStatus = 401;
  await openChat(page);
  const input = page.getByRole('textbox', { name: '输入消息', exact: true });
  await input.fill('本地替身消息');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: '📱 扫码登录' })).toBeVisible();
  await expect(input).toHaveValue('本地替身消息');
});

test('chat_backs_off_group_failures_and_resets_after_recovery', async ({ page }) => {
  await page.clock.install();
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await expect(page.locator('.messages')).toContainText('消息 3');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const reads = () => requests.filter(request => request === 'GET /chat/groups').length;
  groupsStatus = 500;
  const before = reads();
  await page.clock.runFor(1000);
  await expect.poll(reads).toBe(before + 1);
  await page.waitForTimeout(50);
  await page.clock.runFor(1000);
  expect(reads()).toBe(before + 1);
  await page.clock.runFor(1000);
  await expect.poll(reads).toBe(before + 2);
  await page.waitForTimeout(50);
  await page.clock.runFor(3000);
  expect(reads()).toBe(before + 2);
  groupsStatus = 200;
  await page.clock.runFor(1000);
  await expect.poll(reads).toBe(before + 3);
  await page.waitForTimeout(50);
  await page.clock.runFor(1000);
  await expect.poll(reads).toBe(before + 4);
});

test('chat_expired_login_does_not_refresh_groups_on_focus', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  loginValid = false;
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await expect(page.getByRole('button', { name: '📱 扫码登录' })).toBeVisible();
  const before = requests.filter(request => request === 'GET /chat/groups').length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(250);
  expect(requests.filter(request => request === 'GET /chat/groups').length).toBe(before);
});

test('chat_an_old_group_send_does_not_refresh_the_new_group', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/chat/messages/send', async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  messagesByGid.set(1, makeMessages(1, 3, '旧群'));
  messagesByGid.set(2, makeMessages(2, 3, '新群'));
  await openChat(page);
  const sending = page.waitForRequest(request => request.url().endsWith('/chat/messages/send'));
  await page.getByRole('textbox', { name: '输入消息', exact: true }).fill('本地替身消息');
  await page.getByRole('textbox', { name: '输入消息', exact: true }).press('Enter');
  await sending;
  await page.locator('.group-row', { hasText: '第二群' }).click();
  await expect(page.locator('.messages')).toContainText('新群 3');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const reads = () => requests.filter(request => request.includes('/chat/messages/cursor?gid=2')).length;
  const before = reads();
  const response = page.waitForResponse(item => item.url().endsWith('/chat/messages/send'));
  release();
  await response;
  await expect(page.locator('.composer-hint')).toContainText('按下 Enter');
  await page.waitForTimeout(200);
  expect(reads()).toBe(before);
});

test('chat_analysis_abort_does_not_leave_a_false_failure', async ({ page }) => {
  analysisItems = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, date: '2026-10-18', promptPreview: `分析 ${index + 1}`,
    messageCount: 10, createdAt: '2026-10-18 09:00',
  }));
  await page.route('**/chat/analyses?*', async route => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') {
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    await route.continue().catch(() => {});
  });
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '🤖 群聊分析' }).click();
  const dialog = page.locator('dialog.analysis-dialog');
  await expect(dialog.locator('.analysis-item')).toHaveCount(20);
  const request = page.waitForRequest(item => item.url().includes('/chat/analyses?')
    && new URL(item.url()).searchParams.get('page') === '2');
  await dialog.getByRole('button', { name: '下一页 ➡️' }).click();
  await request;
  const response = page.waitForResponse(item => item.url().includes('/chat/analyses?')
    && new URL(item.url()).searchParams.get('page') === '1');
  await dialog.getByRole('button', { name: '⬅️ 上一页' }).click();
  await response;
  await expect(dialog.locator('.analysis-item')).toHaveCount(20);
  await expect(dialog.locator('.analysis-feedback')).toHaveCount(0);
});

test('chat_dream_can_rehover_after_an_interrupted_hover', async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesByGid.get(1)![0].senderId = 1176117365;
  await openChat(page);
  const avatar = page.locator('[data-sender-id="1176117365"]').first();
  await avatar.hover();
  await page.waitForTimeout(200);
  await page.mouse.move(20, 20);
  await avatar.hover();
  await expect(page.locator('.dream-popover')).toBeVisible({ timeout: 4000 });
});

test('chat_scrolling_cancels_a_pending_dream_probe', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/chat/dream/1176117365.html', async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>dream</html>' });
  });
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  messagesByGid.get(1)![0].senderId = 1176117365;
  await openChat(page);
  const probe = page.waitForRequest(request => request.url().endsWith('/chat/dream/1176117365.html'));
  await page.locator('[data-sender-id="1176117365"]').first().hover();
  await probe;
  await page.locator('.messages').evaluate(element => element.dispatchEvent(new Event('scroll')));
  release();
  await page.waitForTimeout(150);
  await expect(page.locator('.dream-popover')).toHaveCount(0);
});

for (const viewport of [{ width: 900, height: 560 }, { width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
test(`chat_acceptance_combines_history_media_analysis_and_reading_at_${viewport.width}`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  const items = makeMessages(1, 60, '组合消息');
  items[59].text = '验收图片';
  items[59].previewUrl = '/chat/media?gid=1&mid=60&variant=preview';
  items[59].originalUrl = '/chat/media?gid=1&mid=60&variant=original';
  messagesByGid.set(1, items);
  analysisItems = [{ id: 1, date: '2026-10-17', promptPreview: '验收分析', messageCount: 12, createdAt: '2026-10-17 09:00' }];
  await openChat(page);
  await expect(page.locator('.messages [data-mid="60"]')).toBeVisible();
  await expect.poll(() => atBottom(page)).toBe(true);
  await page.getByRole('searchbox', { name: '搜索群聊' }).fill('第一');
  await page.getByRole('textbox', { name: '输入消息' }).fill('保留的草稿');
  const scrollTop = await page.locator('.messages').evaluate(element => element.scrollTop);

  const historyTrigger = page.getByRole('button', { name: '📜 聊天记录' });
  await historyTrigger.focus();
  await page.keyboard.press('Enter');
  const history = page.locator('dialog.history-dialog');
  await history.getByLabel('开始日期').fill('2026-08-05');
  await history.getByLabel('结束日期').fill('2026-08-07');
  await history.getByLabel('内容', { exact: true }).fill('验收图片');
  await history.getByRole('button', { name: '🔍 查询' }).click();
  await expect(history.locator('.history-result')).toHaveCount(1);
  await history.locator('.history-result').click();
  const imageTrigger = history.locator('[data-mid="60"]').getByRole('button', { name: '查看原图' });
  await imageTrigger.click();
  const viewer = history.locator('dialog.image-viewer');
  await expect(viewer.getByAltText('消息原图')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).not.toHaveJSProperty('open', true);
  await expect(history).toHaveJSProperty('open', true);
  await expect(imageTrigger).toBeFocused();
  await history.screenshot({ path: testInfo.outputPath('history-context.png') });
  await page.keyboard.press('Escape');
  await expect(historyTrigger).toBeFocused();

  const analysisTrigger = page.getByRole('button', { name: '🤖 群聊分析' });
  await analysisTrigger.click();
  const analysis = page.locator('dialog.analysis-dialog');
  await analysis.locator('.analysis-item').click();
  await expect(analysis.locator('.analysis-detail-content h2')).toHaveText('结论');
  await analysis.screenshot({ path: testInfo.outputPath('analysis-detail.png') });
  await page.keyboard.press('Escape');
  await expect(analysisTrigger).toBeFocused();
  await expect(page.getByRole('textbox', { name: '输入消息' })).toHaveValue('保留的草稿');
  await expect(page.getByRole('searchbox', { name: '搜索群聊' })).toHaveValue('第一');
  expect(Math.abs(await page.locator('.messages').evaluate(element => element.scrollTop) - scrollTop)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: '进入沉浸阅读' }).click();
  await expect(page.locator('.composer')).toBeHidden();
  await page.getByRole('button', { name: '退出沉浸阅读' }).click();
  await expect(page.getByRole('textbox', { name: '输入消息' })).toHaveValue('保留的草稿');
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    innerWidth, innerHeight,
  }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.innerWidth);
  expect(geometry.height).toBeLessThanOrEqual(geometry.innerHeight);
  expect(sendBodies).toEqual([]);
  expect(requests.some(value => value.startsWith('POST '))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('chat-combined.png') });
});
}

for (const operation of ['query', 'capture']) {
test(`chat_acceptance_closing_history_cancels_pending_${operation}`, async ({ page }) => {
  messagesByGid.set(1, makeMessages(1, 3, '消息'));
  await openChat(page);
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  const history = page.locator('dialog.history-dialog');
  const path = operation === 'query' ? '/chat/messages' : '/chat/since';
  const aborted: string[] = [];
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === path) aborted.push(request.url());
  });
  holdPredicate = url => url.pathname === path;
  await history.getByRole('button', { name: operation === 'query' ? '🔍 查询' : '⬇️ 同步历史' }).click();
  await expect.poll(() => held.length).toBe(1);
  await history.getByRole('button', { name: '关闭聊天记录' }).click();
  await expect(history).not.toHaveJSProperty('open', true);
  try {
    await expect.poll(() => aborted.length, { timeout: 2000 }).toBe(1);
  } finally {
    releaseHeld();
  }
  await page.getByRole('button', { name: '📜 聊天记录' }).click();
  await expect(history.locator('.history-empty')).toHaveText('设置筛选条件后点击查询');
  await expect(history.getByRole('button', { name: '⬇️ 同步历史' })).toBeEnabled();
});
}

test('chat_acceptance_preserves_the_window_logo_and_favicon', async ({ page }) => {
  await openChat(page);
  await expect(page.locator('.title-logo img')).toBeVisible();
  await expect.poll(() => page.locator('.title-logo img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
  const href = await page.locator('head link[rel="icon"]').getAttribute('href');
  const response = await page.request.get(new URL(href!, page.url()).href);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});

test('chat_acceptance_shows_the_current_group_number_after_switching', async ({ page }) => {
  await openChat(page);
  await expect(page.locator('.group-number')).toContainText('群号：1');
  await page.locator('.group-row').filter({ hasText: '第二群' }).click();
  await expect(page.locator('.group-number')).toContainText('群号：2');
  await expect(page.locator('.group-number')).not.toContainText('群号：1');
});
