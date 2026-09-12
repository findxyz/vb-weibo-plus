// 二维码扫码登录控制器：POST 拉起登录、二维码图片 3 秒后首拉、10 秒轮询换新；
// start 带防重入并接管按钮 loading 态，stop 清掉全部定时器并复位图片与占位。
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

  function refreshImage() {
    const preload = new Image();
    preload.onload = () => {
      image.src = preload.src;
      image.hidden = false;
      if (loading) loading.hidden = true;
    };
    preload.src = `/weibo/login/qr/image?t=${Date.now()}`;
  }

  function startImagePolling() {
    image.hidden = true;
    if (loading) loading.hidden = false;
    firstFetchTimer = setTimeout(refreshImage, QR_FIRST_FETCH_DELAY);
    imageTimer = setInterval(refreshImage, QR_IMAGE_INTERVAL);
  }

  function stopImagePolling() {
    clearTimeout(firstFetchTimer);
    firstFetchTimer = null;
    clearInterval(imageTimer);
    imageTimer = null;
    image.hidden = true;
    if (loading) loading.hidden = true;
  }

  async function start() {
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.textContent = loadingText;
    startImagePolling();
    try {
      await fetchJson("/weibo/login/qr", {method: "POST"});
      await onSuccess();
    } catch (error) {
      if (onError) onError(error);
      else console.warn("扫码登录失败：", error);
    } finally {
      stopImagePolling();
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
