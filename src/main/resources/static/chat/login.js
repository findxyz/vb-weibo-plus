// chat 页登录壳：检测与扫码入口在 shared/login.js，这里只补 chat 独有的
// 周期检测——外部每次刷新时调 maybeCheck，累计 LOGIN_CHECK_INTERVAL 次才真正
// 请求，避免随 3 秒轮询刷接口。
import {createLogin} from "../shared/login.js";

const LOGIN_CHECK_INTERVAL = 60;

export function createChatLogin({elements, idleText, loadingText, onRelogin, onError}) {
  const login = createLogin({elements, idleText, loadingText, onRelogin, onError});
  let checkTick = 0;

  function maybeCheck() {
    if (document.hidden || login.qrLogin.pending || ++checkTick < LOGIN_CHECK_INTERVAL) return;
    checkTick = 0;
    void login.checkLoginStatus();
  }

  return {
    showLoginExpired: login.showLoginExpired,
    maybeCheck,
    checkLoginStatus: login.checkLoginStatus
  };
}
