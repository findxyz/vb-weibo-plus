type Props = {
  name?: string | null;
  avatar?: string | null;
  className: string;
};

// 头像与旧页同源：真实头像走本地图片代理，缺失时退回名称首字。
export default function Avatar({ name, avatar, className }: Props) {
  return (
    <span className={className} aria-hidden="true">
      {avatar
        ? <img src={`/chat/image?${new URLSearchParams({ url: avatar })}`} alt="" />
        : (name?.trim().slice(0, 1) || '群')}
    </span>
  );
}
