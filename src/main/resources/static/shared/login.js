// 登录状态：检测、扫码登录入口与失效提示，chat 与 post 两页共用。
// valid 语义统一为严格 true——响应缺字段或形态异常时宁可误报失效
//（可扫码恢复），也不漏报失效后空转轮询。
import {fetchJson} from "./fetch.js";
import {createQrLogin} from "./qr-login.js";

export function createLogin({
  elements: {loginExpired, loginQr, loginQrImg, qrLoading = null},
  idleText,
  loadingText,
  onRelogin = null,
  onExpired = null,
  onError = null}) {

  // 扫码登录交给 shared 控制器：防重入、首拉延迟、10 秒轮询与按钮 loading 态都在那里
  const qrLogin = createQrLogin({
    button: loginQr,
    image: loginQrImg,
    loading: qrLoading,
    idleText,
    loadingText,
    onSuccess: async () => {
      loginExpired.hidden = true;
      if (onRelogin) await onRelogin();
      void checkLoginStatus();
    },
    onError: error => {
      if (onError) onError(error);
      else console.warn("扫码登录失败：", error);
    }
  });

  function showLoginExpired() {
    loginExpired.hidden = false;
    if (onExpired) onExpired();
  }

  async function checkLoginStatus() {
    try {
      const result = await fetchJson("/weibo/login/status", {cache: "no-store"});
      if (qrLogin.pending) return;
      if (result.valid === true) loginExpired.hidden = true;
      else showLoginExpired();
    } catch (error) {
      // 登录检测失败不打扰用户，仅留调试信息
      console.warn("检查登录状态失败：", error);
    }
  }

  return {showLoginExpired, checkLoginStatus, qrLogin};
}
