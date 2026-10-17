import Avatar from './Avatar';
import { groupMemberCount, groupName } from './display';
import type { ChatGroup } from './api';

type Props = {
  groups: ChatGroup[];
  selectedGid: number | null;
  pending: boolean;
  failed: boolean;
  onSelect: (gid: number) => void;
  onRetry: () => void;
};

export default function GroupList({ groups, selectedGid, pending, failed, onSelect, onRetry }: Props) {
  return (
    <aside className="groups-panel">
      <div className="groups-heading">
        <h2>群聊</h2>
        <span>{`${groups.length} 个群`}</span>
      </div>
      <div className="groups-list">
        {pending && <p className="groups-empty" role="status">正在加载群聊……</p>}
        {failed && (
          <div className="groups-failure" role="alert">
            <p>群聊列表加载失败，请稍后重试。</p>
            <button type="button" onClick={onRetry}>重试</button>
          </div>
        )}
        {!pending && !failed && groups.length === 0 && <p className="groups-empty" role="status">还没有群聊。</p>}
        {groups.map(group => {
          const active = group.gid === selectedGid;
          return (
            <button
              key={group.gid}
              type="button"
              className={`group-row${active ? ' active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(group.gid)}
            >
              <Avatar className="group-avatar" name={group.name} avatar={group.avatar} />
              <span className="group-copy">
                <span className="group-name">{groupName(group)}</span>
                <span className="group-preview">{groupMemberCount(group)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
