// 统一的 JSON 拉取：非 2xx 时把后端错误体里的 msg 带到异常上，
// 调用方可以直接展示 msg，也可以读 error.status 做分支处理。
// 默认 15 秒超时防止请求无限挂起；长请求（如 /post/list 大页）显式传更大的
// timeoutMs，分析流式与历史同步走裸 fetch 不经这里。
export async function fetchJson(url, options = {}) {
  const {timeoutMs = 15000, ...fetchOptions} = options;
  const signal = fetchOptions.signal ?? AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(url, {...fetchOptions, signal});
  } catch (error) {
    if (error.name === "TimeoutError") {
      const timeout = new Error("请求超时，请稍后重试");
      timeout.status = 0;
      throw timeout;
    }
    throw error;
  }
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
