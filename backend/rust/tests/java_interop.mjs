import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const javaJar = process.argv[2] ?? fileURLToPath(new URL('../../java/target/weibo-plus.jar', import.meta.url));
const rustExe = process.argv[3] ?? fileURLToPath(new URL('../target/release/weibo-plus.exe', import.meta.url));
const properties = spawnSync('java', ['-XshowSettings:properties', '-version'], {
  encoding: 'utf8',
  windowsHide: true,
});
assert.equal(properties.status, 0, 'JDK 21 is required for the interoperability test.');
const javaHome = properties.stderr.match(/^\s*java\.home\s*=\s*(.+?)\r?$/m)?.[1];
assert.ok(javaHome, 'Could not resolve the Java executable.');
const javaExe = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const data = await mkdtemp(join(tmpdir(), 'weibo-java-rust-'));
const fixtureAi = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks));
  assert.equal(request.url, '/v1/chat/completions');
  assert.match(payload.messages.at(-1).content, /历史群消息/);
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { content: '同一份测试分析' } }] }));
});
fixtureAi.listen(0, '127.0.0.1');
await once(fixtureAi, 'listening');

const settings = [
  '--server.address=127.0.0.1',
  '--server.port=0',
  '--weibo.chat.auto-sync-gids=',
  '--weibo.database-path=' + join(data, 'weibo.db'),
  '--weibo.cookie-file=' + join(data, '.weibo_cookie.txt'),
  '--weibo.ai.base-url=http://127.0.0.1:' + fixtureAi.address().port,
];
let child;

async function start(kind) {
  const config = kind === 'java'
    ? [javaExe, ['-jar', javaJar, ...settings], /Tomcat started on port (\d+)/]
    : [rustExe, [...settings, '--weibo.open-browser=false'], /127\.0\.0\.1:(\d+)\/chat/];
  const [command, args, portPattern] = config;
  child = spawn(command, args, { cwd: data, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(kind + ' startup timed out\n' + log)), 35_000);
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      reject(new Error(kind + ' quit with ' + code + '\n' + log));
    });
    const onOutput = chunk => {
      log = (log + chunk.toString()).slice(-14_000);
      const match = portPattern.exec(log);
      if (match) {
        clearTimeout(timer);
        resolve('http://127.0.0.1:' + match[1]);
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
  });
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill();
  await closed;
}

async function request(base, route, options) {
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  assert.equal(response.status, 200, route + ' ' + text);
  return response.headers.get('Content-Type')?.includes('application/json') ? JSON.parse(text) : text;
}

function analyze(base, prompt) {
  return request(base, '/chat/analyses', {
    method: 'POST',
    body: new URLSearchParams({ gid: '31', date: '2026-08-17', prompt }),
  });
}

try {
  let base = await start('java');
  const sqlite = new DatabaseSync(join(data, 'weibo.db'));
  sqlite.exec(
    "PRAGMA busy_timeout = 5000;" +
    "INSERT INTO groups(gid,name,admins,min_mid,max_mid) VALUES (31,'兼容测试群','[2]',77,77);" +
    "INSERT INTO messages(mid,gid,msg_type,msg_type_name,text,sender_name,created_at,saved_at)" +
    " VALUES (77,31,1,'文本','历史群消息','示例成员',1786896000000,1786896001000);" +
    "INSERT INTO bloggers(uid,screen_name) VALUES (6,'示例博主');" +
    "INSERT INTO posts(mblogid,post_id,uid,content,created_at,saved_at)" +
    " VALUES ('old',501,6,'原有内容',1786896000000,1786896001000);",
  );
  sqlite.close();
  const routes = [
    '/weibo/login/status',
    '/chat/groups',
    '/chat/messages?gid=31&page=1&size=10',
    '/chat/messages/cursor?gid=31&size=10',
    '/post/bloggers',
    '/post/list?page=1&size=20&uids=6',
    '/post/calendar',
  ];
  const expected = await Promise.all(routes.map(route => request(base, route)));
  const javaAnalysis = await analyze(base, 'Java 写入');
  await stop();

  base = await start('rust');
  const actual = await Promise.all(routes.map(route => request(base, route)));
  actual.forEach((body, index) => assert.deepEqual(body, expected[index], routes[index]));
  assert.deepEqual(await request(base, '/chat/analyses/' + javaAnalysis.id), javaAnalysis);
  for (const route of ['/chat/index.html', '/post/index.html']) {
    assert.match(await request(base, route), /\/assets\/.+\.js/);
  }
  const rustAnalysis = await analyze(base, 'Rust 写入');
  await stop();

  base = await start('java');
  assert.deepEqual(await request(base, '/chat/analyses/' + rustAnalysis.id), rustAnalysis);
  console.log('Java and Rust returned the same local responses and read records written by both backends.');
} finally {
  await stop();
  fixtureAi.closeAllConnections();
  await new Promise(resolve => fixtureAi.close(resolve));
  await rm(data, { recursive: true, force: true });
}
