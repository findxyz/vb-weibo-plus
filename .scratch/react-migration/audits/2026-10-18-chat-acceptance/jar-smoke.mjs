import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(`${process.argv[2]}/package.json`);
const { chromium, expect } = require('@playwright/test');
const base = process.argv[3];
const output = process.argv[4];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = [];
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#9cc7e8"/></svg>';
try {
  for (const viewport of [{ width: 900, height: 560 }, { width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
    const geometries = [];
    for (const version of ['legacy', 'react']) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      const resources = [];
      const writes = [];
      let valid = true;
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        const path = new URL(response.url()).pathname;
        if (/^\/assets\//.test(path) || /\.(?:js|css)$/.test(path)) {
          resources.push({ path, status: response.status(), mime: response.headers()['content-type'] });
        }
      });
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        assert.equal(url.origin, base, 'Only local requests are allowed');
        if (request.method() === 'POST') {
          writes.push(url.pathname);
          if (url.pathname === '/weibo/login/qr') { valid = true; return route.fulfill({ json: {} }); }
          if (url.pathname === '/chat/messages/send') return route.fulfill({ status: 409, json: { msg: '已发出但本地同步失败' } });
          if (url.pathname === '/chat/since') return route.fulfill({ status: 204 });
          throw new Error(`Unexpected write: ${url.pathname}`);
        }
        assert.ok(['GET', 'HEAD'].includes(request.method()));
        if (url.pathname === '/weibo/login/status') return route.fulfill({ json: { valid } });
        if (url.pathname === '/chat/image' || url.pathname === '/chat/media') {
          return route.fulfill({ contentType: 'image/svg+xml', body: svg });
        }
        if (url.pathname === '/chat/attitudes') return route.fulfill({ json: {} });
        return route.continue();
      });
      const path = version === 'react' ? '/preview/chat/index.html' : '/chat/index.html';
      assert.equal((await page.goto(base + path)).status(), 200);
      await page.locator('.group-row').filter({ hasText: '打包验收群' }).click();
      await expect(page.locator('.group-number')).toContainText('群号：1');
      await expect.poll(() => page.locator('.title-logo img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
      await expect(page.locator('.messages [data-mid="80"]')).toBeVisible();
      await expect(page.locator('.messages .message')).toHaveCount(50);
      await expect(page.locator('.messages [data-mid="80"] .media-preview img')).toBeVisible();
      await expect.poll(() => page.locator('.messages').evaluate(node =>
        node.scrollTop + node.clientHeight >= node.scrollHeight - 2)).toBe(true);
      assert.ok(await page.locator('.message-avatar img').first().evaluate(img => img.complete && img.naturalWidth > 0));
      const geometry = await page.evaluate(() => {
        const bounds = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const bubble = getComputedStyle(document.querySelector('.bubble'));
        return { title: bounds('.titlebar'), sidebar: bounds('.groups-panel'),
          composer: bounds('.composer'), bubble: { radius: bubble.borderRadius, color: bubble.borderColor },
          overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
      });
      assert.equal(geometry.overflow, false);
      geometries.push(geometry);
      await page.screenshot({ path: `${output}/${version}-${viewport.width}.png` });

      if (version === 'react') {
        await page.getByRole('button', { name: '📜 聊天记录' }).click();
        const history = page.locator('dialog.history-dialog');
        await history.getByLabel('开始日期').fill('2026-08-05');
        await history.getByLabel('结束日期').fill('2026-08-05');
        await history.getByLabel('内容', { exact: true }).fill('验收图片');
        await history.getByRole('button', { name: '🔍 查询' }).click();
        await expect(history.locator('.history-result')).toHaveCount(1);
        await history.locator('.history-result').click();
        await history.locator('[data-mid="80"]').getByRole('button', { name: '查看原图' }).click();
        await expect(history.getByAltText('消息原图')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(history).toHaveJSProperty('open', true);
        await history.getByRole('button', { name: '⬇️ 同步历史' }).click();
        await expect(history.locator('.history-empty')).toContainText('已开始同步');
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: '🤖 群聊分析' }).click();
        const analysis = page.locator('dialog.analysis-dialog');
        await analysis.locator('.analysis-item').click();
        await expect(analysis.locator('.analysis-detail-content h2')).toHaveText('打包分析');
        assert.equal(await page.evaluate(() => window.attack), undefined);
        assert.equal(await analysis.locator('script').count(), 0);
        await page.keyboard.press('Escape');
        await page.getByRole('textbox', { name: '输入消息' }).fill('验证 409');
        await page.getByRole('textbox', { name: '输入消息' }).press('Enter');
        await expect(page.locator('.composer-hint')).toContainText('已发出但本地同步失败');
        await expect(page.getByRole('textbox', { name: '输入消息' })).toHaveValue('验证 409');
        assert.equal(writes.filter(path => path === '/chat/messages/send').length, 1);

        valid = false;
        await page.reload();
        const resumed = page.waitForResponse(async response =>
          new URL(response.url()).pathname === '/weibo/login/status' && (await response.json()).valid === true);
        await page.getByRole('button', { name: '📱 扫码登录', exact: true }).click();
        await resumed;
        await expect(page.locator('.login-expired')).toHaveCount(0);
        await expect(page.locator('.messages [data-mid="80"]')).toBeVisible();
        await page.keyboard.press('Shift');
        const dreamAvatar = page.locator('.messages [data-sender-id="1176117365"]').last();
        await dreamAvatar.scrollIntoViewIfNeeded();
        await page.mouse.move(1, 1);
        await page.waitForTimeout(200);
        await dreamAvatar.hover();
        await page.getByRole('button', { name: '🌀 进入盗梦空间' }).click({ timeout: 6000 });
        await expect(page.locator('dialog.dream-dialog iframe').contentFrame().locator('#game')).toBeVisible();
        await page.screenshot({ path: `${output}/dream-${viewport.width}.png` });
        await page.getByRole('button', { name: '关闭盗梦空间', exact: true }).click();
        await expect(page.locator('dialog.dream-dialog')).not.toHaveJSProperty('open', true);
        await page.getByRole('link', { name: '切换到本地微博' }).click();
      } else {
        await page.getByRole('button', { name: '切换到本地微博' }).click();
      }
      await expect(page).toHaveURL(base + '/post/index.html');
      await expect(page.locator('.post-content')).toContainText('打包微博正文');
      await page.getByRole('button', { name: '切换到微博群聊' }).click();
      await expect(page).toHaveURL(base + '/chat/index.html');
      await expect(page.locator('.messages [data-mid="80"]')).toBeVisible();
      for (const resource of resources) {
        assert.equal(resource.status, 200, resource.path);
        const mime = resource.path.endsWith('.css') ? /text\/css/
          : resource.path.endsWith('.svg') ? /image\/svg\+xml/ : /javascript/;
        assert.match(resource.mime, mime, resource.path);
      }
      assert.deepEqual(errors, []);
      evidence.push({ version, viewport, geometry, writes, resources });
      await context.close();
    }
    assert.deepEqual(geometries[0].title, geometries[1].title);
    assert.deepEqual(geometries[0].sidebar, geometries[1].sidebar);
    assert.deepEqual(geometries[0].bubble, geometries[1].bubble);
  }
  await writeFile(`${output}/acceptance.json`, JSON.stringify(evidence, null, 2));
  console.log('Three-size legacy/React reading, local history/analysis, QR/409/capture stubs, dream and page round trips: PASS');
} finally {
  await browser.close();
}
