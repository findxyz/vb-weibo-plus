// 登录状态：扫码登录、启动检测与跟随刷新节拍的周期检测、失效提示。
// 与 post 页 login.js 同一模式；chat 页多一个周期检测：外部每次刷新时调
// maybeCheck，累计 LOGIN_CHECK_INTERVAL 次才真正请求，避免随 3 秒轮询刷接口。
import {fetchJson} from "../shared/fetch.js";
import {createQrLogin} from "../shared/qr-login.js";

const LOGIN_CHECK_INTERVAL = 60;

export function createLogin({
  elements: {loginExpired, loginQr, loginQrImg, qrLoading},
  onRelogin, onError}) {
  let checkTick = 0;

  // 扫码登录交给 shared 控制器：防重入、首拉延迟、10 秒轮询与按钮 loading 态都在那里
  const qrLogin = createQrLogin({
    button: loginQr,
    image: loginQrImg,
    loading: qrLoading,
    idleText: "📱 扫码登录",
    loadingText: "📱 扫码中…",
    onSuccess: async () => {
      loginExpired.hidden = true;
      await onRelogin();
    },
    onError
  });

  function showLoginExpired() {
    loginExpired.hidden = false;
  }

  function maybeCheck() {
    if (document.hidden || qrLogin.pending || ++checkTick < LOGIN_CHECK_INTERVAL) return;
    checkTick = 0;
    void checkLoginStatus();
  }

  async function checkLoginStatus() {
    try {
      const result = await fetchJson("/weibo/login/status", {cache: "no-store"});
      loginExpired.hidden = result.valid !== false;
    } catch (error) {
      // 登录检测失败不打扰用户，仅留调试信息
      console.warn("检查登录状态失败：", error);
    }
  }

  return {showLoginExpired, maybeCheck, checkLoginStatus};
}
