export const URL_TEXT_RE = /https?:\/\/[^\s<>"'“”‘’（）【】《》，。；：、！？…]+/gi;

const URL_TRAILING_RE = /[.,;:!?)\]}'"]/;

export function stripUrlTrailing(url: string): string {
  let result = url;
  while (result && URL_TRAILING_RE.test(result[result.length - 1])) {
    const tail = result[result.length - 1];
    if (tail === ')' && result.split('(').length - 1 >= result.split(')').length - 1) break;
    if (tail === ']' && result.split('[').length - 1 >= result.split(']').length - 1) break;
    result = result.slice(0, -1);
  }
  return result;
}
