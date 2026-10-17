// 表情贴图沿用旧页的唯一一份映射；这里只负责把短语换成地址。
import '../../../src/main/resources/static/chat/weibo-emoji.js';

type EmojiWindow = Window & { WEIBO_EMOJI_MAP?: Record<string, string> };

const IMAGE_PHRASE_RE = /^\[(\/[0-9a-z]+\.png)\]$/i;
const IMAGE_BASE = 'https://img.t.sinajs.cn/t4/appstyle/expression/emimage';

export function emojiSource(phrase: string) {
  const image = phrase.match(IMAGE_PHRASE_RE);
  if (image) return IMAGE_BASE + image[1];
  return (window as EmojiWindow).WEIBO_EMOJI_MAP?.[phrase];
}
