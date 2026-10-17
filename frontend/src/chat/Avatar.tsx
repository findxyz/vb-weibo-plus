type Props = {
  name?: string | null;
  avatar?: string | null;
  className: string;
  senderId?: number;
  profileUrl?: string;
};

// 头像与旧页同源：真实头像走本地图片代理，缺失时退回名称首字；
// 传入主页地址时渲染为新窗口链接，其余场景保持纯展示。
export default function Avatar({ name, avatar, className, senderId, profileUrl }: Props) {
  const content = avatar
    ? <img src={`/chat/image?${new URLSearchParams({ url: avatar })}`} alt="" />
    : (name?.trim().slice(0, 1) || '群');
  if (profileUrl) {
    return (
      <a className={className} href={profileUrl} target="_blank" rel="noopener noreferrer"
        data-sender-id={senderId} aria-label={`查看${name?.trim() || '群友'}的微博主页`}>
        {content}
      </a>
    );
  }
  return (
    <span className={className} aria-hidden="true" data-sender-id={senderId}>
      {content}
    </span>
  );
}
