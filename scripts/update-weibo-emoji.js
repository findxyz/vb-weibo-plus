#!/usr/bin/env node
/**
 * 更新微博表情映射表（weibo-emoji.js）
 *
 * 数据源：微博官方 webim emotions.json 接口（需登录态 cookie）
 *   https://api.weibo.com/webim/emotions.json?source=209678993
 *
 * 用法：
 *   node scripts/update-weibo-emoji.js
 *
 * 前提：项目根目录下存在 .weibo_cookie.txt（扫码登录后自动生成）。
 * 产出：src/main/resources/static/chat/weibo-emoji.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const COOKIE_FILE = path.join(ROOT, ".weibo_cookie.txt");
const OUT_FILE = path.join(ROOT, "src/main/resources/static/chat/weibo-emoji.js");

const EMOTIONS_URL =
  "https://api.weibo.com/webim/emotions.json?source=209678993";

function fetchText(url, cookie) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://weibo.com/",
          Cookie: cookie
        },
        timeout: 30000
      },
      res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(
            fetchText(new URL(res.headers.location, url).toString(), cookie)
          );
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );
    req.on("timeout", () => req.destroy(new Error("请求超时")));
    req.on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(COOKIE_FILE)) {
    throw new Error(`找不到 cookie 文件：${COOKIE_FILE}，请先扫码登录。`);
  }
  const cookie = fs.readFileSync(COOKIE_FILE, "utf8").trim();
  if (!cookie) {
    throw new Error(`cookie 文件为空：${COOKIE_FILE}，请先扫码登录。`);
  }

  console.log("正在请求微博表情接口…");
  const body = await fetchText(EMOTIONS_URL, cookie);
  const data = JSON.parse(body);
  const list = Array.isArray(data) ? data : data.data || data.list || [];
  if (!list.length) {
    throw new Error("接口返回为空，cookie 可能已失效。");
  }

  const map = {};
  for (const e of list) {
    const phrase = (e.phrase || "").trim();
    if (!phrase) continue;
    const icon = e.icon || e.url;
    if (!icon) continue;
    if (!map[phrase]) map[phrase] = icon; // 去重，保留首条
  }
  const keys = Object.keys(map);
  const js = "window.WEIBO_EMOJI_MAP = " + JSON.stringify(map) + ";\n";

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, js, "utf8");

  console.log(`完成：${keys.length} 条表情 -> ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`示例：[点赞] -> ${map["[点赞]"] || "(无)"}`);
  console.log(`示例：[笑cry] -> ${map["[笑cry]"] || "(无)"}`);
}

main().catch(err => {
  console.error("更新失败：" + err.message);
  process.exit(1);
});
