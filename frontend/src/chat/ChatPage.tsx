import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STORAGE_KEYS } from '../../../src/main/resources/static/shared/storage-keys.js';
import Avatar from './Avatar';
import GroupList from './GroupList';
import MessageList from './MessageList';
import { fetchGroups } from './api';
import { groupCapacity, groupName } from './display';

export default function ChatPage() {
  const groupsQuery = useQuery({
    queryKey: ['chat', 'groups'],
    queryFn: ({ signal }) => fetchGroups(signal),
    staleTime: Infinity,
    refetchOnMount: false,
    // 与消息轮询同节奏；页面隐藏时暂停，回到页面时由 focus 立即刷新一次。
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  });
  const { refetch } = groupsQuery;
  const groups = groupsQuery.data ?? [];

  useEffect(() => {
    const onFocus = () => { void refetch(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const [selectedGid, setSelectedGid] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEYS.CHAT_LAST_GROUP));
    return Number.isSafeInteger(saved) && saved > 0 ? saved : null;
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!groups.length) return;
    if (selectedGid == null || !groups.some(group => group.gid === selectedGid)) {
      setSelectedGid(groups[0].gid);
    }
  }, [groups, selectedGid]);

  useEffect(() => {
    if (selectedGid != null) localStorage.setItem(STORAGE_KEYS.CHAT_LAST_GROUP, String(selectedGid));
  }, [selectedGid]);

  const selectedGroup = groups.find(group => group.gid === selectedGid) ?? null;
  const title = selectedGroup ? `微博群聊 - ${groupName(selectedGroup)}` : '微博群聊';

  useEffect(() => {
    document.title = title;
  }, [title]);

  // 重复点击当前群也重新载入并落底，与旧页「选群即重新打开」一致。
  function selectGroup(gid: number) {
    setSelectedGid(gid);
    setReloadToken(token => token + 1);
  }

  const groupMeta = selectedGroup ? groupCapacity(selectedGroup) : '';

  return (
    <div className="app">
      <header className="titlebar"><h1>{title}</h1></header>
      <div className="workspace">
        <GroupList
          groups={groups}
          selectedGid={selectedGid}
          pending={groupsQuery.isPending}
          failed={groupsQuery.isError && !groupsQuery.data}
          onSelect={selectGroup}
          onRetry={() => { void groupsQuery.refetch(); }}
        />
        <section className="conversation">
          {selectedGroup ? (
            <header className="group-header">
              <Avatar className="main-group-avatar" name={selectedGroup.name} avatar={selectedGroup.avatar} />
              <div className="group-summary">
                <div className="group-title-line">
                  <h2>{groupName(selectedGroup)}</h2>
                </div>
                <p className="group-number">{groupMeta}</p>
              </div>
            </header>
          ) : (
            <header className="group-header empty-header">
              <p className="group-number">{groupsQuery.isPending ? '正在加载群聊……' : '选择左侧群聊查看消息'}</p>
            </header>
          )}
          <div className="messages-shell">
            {selectedGroup ? (
              <MessageList
                key={`${selectedGroup.gid}-${reloadToken}`}
                gid={selectedGroup.gid}
                admins={selectedGroup.admins ?? []}
              />
            ) : (
              <p className="messages-state">{groupsQuery.isPending ? '正在加载群聊……' : '暂无群聊。'}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
