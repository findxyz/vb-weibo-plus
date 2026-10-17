// chat 会话读取的接口层：路径与参数沿用旧页，排序口径全页只有 compareMessages 一处。
export type ChatGroup = {
  gid: number;
  name: string;
  avatar: string;
  memberCount: number;
  maxMember: number;
  ownerId: number;
  admins: number[] | null;
  summary: string;
  groupType: number;
  latestSenderName: string;
  latestMessage: string;
  messageCount: number;
};

export type ChatMessage = {
  mid: number;
  gid: number;
  msgType: number;
  msgTypeName: string;
  mediaType: number;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  text: string;
  urlObjects: unknown[] | null;
  picInfos: unknown[] | null;
  template: string | null;
  templateData: unknown;
  recallMids: string[] | null;
  recallBy: string | null;
  createdAt: number;
  savedAt: number;
  previewUrl: string;
  originalUrl: string;
  videoUrl: string;
  fileUrl: string;
};

export type MessageCursor = { createdAt: number; mid: number };

export type MessagePage = {
  items: ChatMessage[];
  size: number;
  hasMore: boolean;
  nextBeforeCreatedAt: number | null;
  nextBeforeMid: number | null;
  nextAfterCreatedAt: number | null;
  nextAfterMid: number | null;
};

export const MESSAGE_PAGE_SIZE = 50;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { msg?: unknown };
      if (typeof body?.msg === 'string' && body.msg) message = body.msg;
    } catch {
      // 非 JSON 错误响应保留状态码文案。
    }
    throw new Error(message);
  }
  return await response.json() as T;
}

export function fetchGroups(signal: AbortSignal) {
  return getJson<ChatGroup[]>('/chat/groups', signal);
}

export function fetchLatestMessages(gid: number, size: number, signal: AbortSignal) {
  const query = new URLSearchParams({ gid: String(gid), size: String(size) });
  return getJson<MessagePage>(`/chat/messages/cursor?${query}`, signal);
}

export function fetchEarlierMessages(gid: number, size: number, cursor: MessageCursor, signal: AbortSignal) {
  const query = new URLSearchParams({
    gid: String(gid),
    size: String(size),
    beforeCreatedAt: String(cursor.createdAt),
    beforeMid: String(cursor.mid),
  });
  return getJson<MessagePage>(`/chat/messages/cursor?${query}`, signal);
}

export function fetchNewerMessages(gid: number, size: number, cursor: MessageCursor, signal: AbortSignal) {
  const query = new URLSearchParams({
    gid: String(gid),
    size: String(size),
    afterCreatedAt: String(cursor.createdAt),
    afterMid: String(cursor.mid),
  });
  return getJson<MessagePage>(`/chat/messages/cursor?${query}`, signal);
}

export function nextBeforeCursor(page: MessagePage): MessageCursor | null {
  if (!page.hasMore) return null;
  return page.nextBeforeCreatedAt != null && page.nextBeforeMid != null
    ? { createdAt: page.nextBeforeCreatedAt, mid: page.nextBeforeMid }
    : null;
}

export function nextAfterCursor(page: MessagePage): MessageCursor | null {
  if (!page.hasMore) return null;
  return page.nextAfterCreatedAt != null && page.nextAfterMid != null
    ? { createdAt: page.nextAfterCreatedAt, mid: page.nextAfterMid }
    : null;
}

export function compareMessages(left: ChatMessage, right: ChatMessage) {
  return left.createdAt - right.createdAt || left.mid - right.mid;
}
