import type { ChatGroup } from './api';

export function groupName(group: ChatGroup) {
  return group.name || `群聊 ${group.gid}`;
}

export function groupMemberCount(group: ChatGroup) {
  return `${group.maxMember || group.memberCount} 人群`;
}

export function groupCapacity(group: ChatGroup) {
  const members = groupMemberCount(group);
  return typeof group.messageCount === 'number' ? `${members} + ${group.messageCount} 条消息` : members;
}

// 与旧 groups.js 的预览口径一致：发送者：内容，无发送者只显示内容，都没有退回人数。
export function groupPreview(group: ChatGroup) {
  const sender = group.latestSenderName?.trim() || '';
  const message = group.latestMessage?.trim() || '';
  if (!sender && !message) return groupMemberCount(group);
  return sender ? `${sender}：${message}` : message;
}
