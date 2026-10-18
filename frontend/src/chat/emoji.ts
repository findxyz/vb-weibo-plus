import { WEIBO_EMOJI_MAP } from './emoji-map.js';

const IMAGE_PHRASE_RE = /^\[(\/[0-9a-z]+\.png)\]$/i;
const IMAGE_BASE = 'https://img.t.sinajs.cn/t4/appstyle/expression/emimage';

export function emojiSource(phrase: string) {
  const image = phrase.match(IMAGE_PHRASE_RE);
  if (image) return IMAGE_BASE + image[1];
  return WEIBO_EMOJI_MAP[phrase];
}

export function emojiEntries() {
  return Object.entries(WEIBO_EMOJI_MAP);
}
