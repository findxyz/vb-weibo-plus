// 统一的 JSON 拉取：非 2xx 时把后端错误体里的 msg 带到异常上，
// 调用方可以直接展示 msg，也可以读 error.status 做分支处理。
export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    let backendMsg = null;
    try {
      const body = await response.json();
      if (body.msg) {
        backendMsg = body.msg;
        msg = body.msg;
      }
    } catch {
      // 非 JSON 错误体，沿用默认消息
    }
    const error = new Error(msg);
    error.status = response.status;
    if (backendMsg) error.msg = backendMsg;
    throw error;
  }
  return response.json();
}
