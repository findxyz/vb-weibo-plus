import { useState, type ReactNode } from 'react';
import Avatar from './Avatar';
import { groupName, groupPreview } from './display';
import type { ChatGroup } from './api';

type Props = {
  groups: ChatGroup[];
  selectedGid: number | null;
  pending: boolean;
  failed: boolean;
  onSelect: (gid: number) => void;
  onRetry: () => void;
  footer?: ReactNode;
};

export default function GroupList({ groups, selectedGid, pending, failed, onSelect, onRetry, footer }: Props) {
  const [keyword, setKeyword] = useState('');
  const normalized = keyword.trim().toLowerCase();
  const matches = (group: ChatGroup) => !normalized
    || `${groupName(group)} ${groupPreview(group)}`.toLowerCase().includes(normalized);

  return (
    <aside className="groups-panel" aria-label="群聊列表">
      <div className="groups-heading">
        <h2>群聊列表</h2>
        <span>{groups.length ? `${groups.length} 个群聊` : '暂无群聊'}</span>
      </div>
      <label className="search-box">
        <span className="visually-hidden">搜索群聊</span>
        <input type="search" value={keyword} placeholder="搜索群聊"
          onChange={event => setKeyword(event.target.value)} />
      </label>
      <div className="groups-list">
        {pending && <p className="groups-empty" role="status">正在加载群聊……</p>}
        {failed && (
          <div className="groups-failure" role="alert">
            <p>群聊列表加载失败，请稍后重试。</p>
            <button type="button" onClick={onRetry}>重试</button>
          </div>
        )}
        {!pending && !failed && groups.length === 0 && (
          <p className="groups-empty" role="status">暂无群聊数据</p>
        )}
        {groups.map(group => {
          const active = group.gid === selectedGid;
          const preview = groupPreview(group);
          return (
            <button
              key={group.gid}
              type="button"
              className={`group-row${active ? ' active' : ''}`}
              aria-current={active ? 'true' : undefined}
              aria-label={`${groupName(group)}，${preview}`}
              hidden={!matches(group)}
              onClick={() => onSelect(group.gid)}
            >
              <Avatar className="group-avatar" name={group.name} avatar={group.avatar} />
              <span className="group-copy">
                <span className="group-name">{groupName(group)}</span>
                <span className="group-preview">{preview}</span>
              </span>
            </button>
          );
        })}
      </div>
      {footer}
    </aside>
  );
}
