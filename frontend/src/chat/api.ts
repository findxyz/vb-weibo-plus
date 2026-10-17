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
  // 表态由 `/chat/attitudes` 按需补入，服务端消息本身不携带。
  attitudes?: Attitude[];
};

export type Attitude = { name?: string; count?: number; selected?: boolean };

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

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

async function readError(response: Response) {
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json() as { msg?: unknown };
    if (typeof body?.msg === 'string' && body.msg) message = body.msg;
  } catch {
    // 非 JSON 错误响应保留状态码文案。
  }
  return message;
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new HttpError(await readError(response), response.status);
  return await response.json() as T;
}

export async function sendText(gid: number, content: string) {
  const response = await fetch('/chat/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ gid: String(gid), content }),
  });
  if (!response.ok) throw new HttpError(await readError(response), response.status);
}

async function postForm(url: string, form: FormData) {
  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) throw new HttpError(await readError(response), response.status);
}

export function sendImage(gid: number, file: File) {
  const form = new FormData();
  form.append('gid', String(gid));
  form.append('file', file);
  return postForm('/chat/messages/sendImage', form);
}

export function sendVideo(gid: number, file: File) {
  const form = new FormData();
  form.append('gid', String(gid));
  form.append('file', file);
  return postForm('/chat/messages/sendVideo', form);
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

export function fetchAttitudes(gid: number, mids: number[], signal: AbortSignal) {
  const query = new URLSearchParams({ gid: String(gid), mids: mids.join(',') });
  return getJson<Record<string, Attitude[]>>(`/chat/attitudes?${query}`, signal);
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
