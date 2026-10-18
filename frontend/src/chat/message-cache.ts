import type { ChatMessage } from './api';

const MAX_MESSAGES = 20000;
const TRIM_TO = 18000;

export function trimMessageCache(
  ordered: ChatMessage[], messages: Map<number, ChatMessage>, heights: Map<number, number>,
): ChatMessage[] {
  if (ordered.length <= MAX_MESSAGES) return ordered;
  const drop = ordered.length - TRIM_TO;
  for (let index = 0; index < drop; index += 1) {
    messages.delete(ordered[index].mid);
    heights.delete(ordered[index].mid);
  }
  return ordered.slice(drop);
}
