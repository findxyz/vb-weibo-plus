// 登录状态：检测失效并展示扫码登录入口（二维码轮询与防重入在 shared 控制器里）。
import {fetchJson} from "../shared/fetch.js";
import {createQrLogin} from "../shared/qr-login.js";
import {showState} from "./helpers.js";

export function createLogin({elements: {loginExpired, loginQr, loginQrImg, bloggersState}}) {
  // 扫码登录交给 shared 控制器：防重入、首拉延迟、10 秒轮询与按钮 loading 态都在那里
  const qrLogin = createQrLogin({
    button: loginQr,
    image: loginQrImg,
    idleText: "扫码登录",
    loadingText: "扫码中…",
    onSuccess: () => checkLoginStatus(),
    onError: error => showState(bloggersState, `登录请求失败：${error.message}`)
  });

  function showLoginExpired() {
    loginExpired.hidden = false;
  }

  async function checkLoginStatus() {
    try {
      const result = await fetchJson("/weibo/login/status", {cache: "no-store"});
      if (!result.valid) {
        showLoginExpired();
      } else {
        loginExpired.hidden = true;
      }
    } catch (error) {
      // 登录检测失败不打扰用户，仅留调试信息
      console.warn("检查登录状态失败：", error);
    }
  }

  return {checkLoginStatus, showLoginExpired};
}
