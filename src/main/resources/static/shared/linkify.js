// 跨页共用的文本链接化原语：URL 识别与尾随标点剥离全站只有这一份定义。
// chat 在纯文本分段里用（message-view），post 在 DOM 树文本节点里用（posts）。

// 匹配 http/https 地址，字符类里排除空白、引号（含中文弯引号）、尖括号与常见中文标点
export const URL_TEXT_RE = /https?:\/\/[^\s<>"'“”‘’（）【】《》，。；：、！？…]+/gi;

// 地址末尾容易粘带的英文标点，链接化时剥掉
const URL_TRAILING_RE = /[.,;:!?)\]}'"]/;

// 剥掉末尾标点；成对括号只剥不成对的（如 wiki/A_(B) 的右括号保留）
export function stripUrlTrailing(url) {
  while (url && URL_TRAILING_RE.test(url[url.length - 1])) {
    const tail = url[url.length - 1];
    if (tail === ")" && (url.split("(").length - 1) >= (url.split(")").length - 1)) break;
    if (tail === "]" && (url.split("[").length - 1) >= (url.split("]").length - 1)) break;
    url = url.slice(0, -1);
  }
  return url;
}
