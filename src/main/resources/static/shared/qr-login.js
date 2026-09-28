// 二维码扫码登录控制器：POST 拉起登录、二维码图片 3 秒后首拉、10 秒轮询换新；
// start 带防重入并接管按钮 loading 态；请求失败时保留最后一张二维码。
// 群聊页与 post 页以元素句柄接入，成功/失败的页面侧收尾由回调提供。
import {fetchJson} from "./fetch.js";

const QR_IMAGE_INTERVAL = 10000;
const QR_FIRST_FETCH_DELAY = 3000;

export function createQrLogin({
  button,
  image,
  loading = null,
  idleText,
  loadingText,
  onSuccess,
  onError = null
}) {
  let imageTimer = null;
  let firstFetchTimer = null;
  let pending = false;
  // loading 元素的原始文案：二维码图加载失败要改写它，重拉成功前先复原
  const loadingIdleText = loading?.textContent ?? "";

  function refreshImage() {
    const preload = new Image();
    preload.onload = () => {
      if (!pending) return;
      image.src = preload.src;
      image.hidden = false;
      if (loading) {
        loading.textContent = loadingIdleText;
        loading.hidden = true;
      }
    };
    // 保留已显示的二维码；首图失败时提示重试，轮询继续
    preload.onerror = () => {
      if (!pending) return;
      if (loading && image.hidden) {
        loading.hidden = false;
        loading.textContent = "二维码加载重试…";
      }
    };
    preload.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }

  function startImagePolling() {
    if (loading && image.hidden) {
      loading.textContent = loadingIdleText;
      loading.hidden = false;
    }
    firstFetchTimer = setTimeout(refreshImage, QR_FIRST_FETCH_DELAY);
    imageTimer = setInterval(refreshImage, QR_IMAGE_INTERVAL);
  }

  function stopImagePolling(clearImage) {
    clearTimeout(firstFetchTimer);
    firstFetchTimer = null;
    clearInterval(imageTimer);
    imageTimer = null;
    if (clearImage) {
      image.hidden = true;
      if (loading) loading.hidden = true;
    } else if (loading && image.hidden) {
      loading.textContent = "暂无二维码";
      loading.hidden = false;
    }
  }

  async function start() {
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.textContent = loadingText;
    startImagePolling();
    let succeeded = false;
    try {
      // 后端最多等待扫码 300 秒，额外留出群列表同步时间。
      await fetchJson("/weibo/login/qr", {method: "POST", timeoutMs: 360000});
      await onSuccess();
      succeeded = true;
    } catch (error) {
      if (onError) onError(error);
      else console.warn("扫码登录失败：", error);
    } finally {
      stopImagePolling(succeeded);
      pending = false;
      button.disabled = false;
      button.textContent = idleText;
    }
  }

  button.addEventListener("click", start);
  return {
    start,
    get pending() { return pending; }
  };
}
