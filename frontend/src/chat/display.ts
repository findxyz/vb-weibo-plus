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
