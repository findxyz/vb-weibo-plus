import type { ReactNode } from 'react';
import { URL_TEXT_RE, stripUrlTrailing } from '../shared/linkify.js';
import { emojiSource } from './emoji';

const EMOJI_PHRASE_RE = /\[[^\[\]]+\]/g;

function pushText(nodes: ReactNode[], text: string, keys: { value: number }) {
  let offset = 0;
  for (const match of text.matchAll(EMOJI_PHRASE_RE)) {
    const source = emojiSource(match[0]);
    if (!source) continue;
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    nodes.push(
      <img key={`emoji-${keys.value++}`} className="emoji" src={source} alt={match[0]} loading="lazy" />,
    );
    offset = match.index + match[0].length;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
}

// 与旧 message-view 同序：先按 URL 切段，链接段原样显示，其余段再把表情短语换成贴图。
export default function MessageText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const keys = { value: 0 };
  let offset = 0;
  URL_TEXT_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_TEXT_RE)) {
    const url = stripUrlTrailing(match[0]);
    if (!url) continue;
    pushText(nodes, text.slice(offset, match.index), keys);
    nodes.push(
      <a key={`link-${keys.value++}`} href={url} target="_blank" rel="noopener noreferrer">{url}</a>,
    );
    offset = match.index + url.length;
  }
  pushText(nodes, text.slice(offset), keys);
  return <>{nodes}</>;
}
