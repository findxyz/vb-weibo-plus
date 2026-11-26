import type { ChatGroup } from './api';

export function groupName(group: ChatGroup) {
  return group.name || `群聊 ${group.gid}`;
}

export function groupMemberCount(group: ChatGroup) {
  return `${group.maxMember || group.memberCount} 人群`;
}

export function groupPreview(group: ChatGroup) {
  const sender = group.latestSenderName?.trim() || '';
  const message = group.latestMessage?.trim() || '';
  if (!sender && !message) return groupMemberCount(group);
  return sender ? `${sender}：${message}` : message;
}
