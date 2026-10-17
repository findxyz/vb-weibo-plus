import Avatar from './Avatar';
import MessageText from './MessageText';
import WeiboCard, { type WeiboUrlObject } from './WeiboCard';
import type { ChatMessage } from './api';

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

// 与旧 message-view.js 一致：这些占位文案在图片消息里不重复显示。
const HIDDEN_CAPTIONS = new Set(['分享图片', '分享视频', '[动画表情]']);
const SYSTEM_SENDER = '粉丝群';
const WEIBO_CARD_TYPE = 14;

function messageBody(message: ChatMessage, text: string, hideText: boolean) {
  if (message.fileUrl) {
    return (
      <div className="bubble">
        <a className="file-download" href={message.fileUrl} download={message.text || ''}
          target="_blank" rel="noopener noreferrer">{message.text || '下载文件'}</a>
      </div>
    );
  }
  const card = message.mediaType === WEIBO_CARD_TYPE
    ? message.urlObjects?.[0] as WeiboUrlObject | undefined
    : undefined;
  if (card?.status) return <WeiboCard urlObject={card} />;
  if (hideText) return null;
  return <div className="bubble"><MessageText text={text} /></div>;
}

export default function MessageItem({ message, isAdmin }: { message: ChatMessage; isAdmin: boolean }) {
  const isSystem = message.senderName?.trim() === SYSTEM_SENDER;
  // 本票只展示图片缩略图；视频按可读文本降级，不把封面当成可查看的图片。
  const hasMedia = Boolean(message.previewUrl) && !message.videoUrl;
  const text = message.text?.trim() ? message.text : `[${message.msgTypeName || '消息'}]`;
  const hideText = hasMedia && HIDDEN_CAPTIONS.has(message.text?.trim() ?? '');

  if (isSystem) {
    return (
      <article className="message system-message" data-mid={message.mid}>
        <div className="bubble"><MessageText text={text} /></div>
      </article>
    );
  }

  return (
    <article className={`message${isAdmin ? ' admin-message' : ''}`} data-mid={message.mid}>
      <Avatar
        className="message-avatar"
        name={message.senderName}
        avatar={message.senderAvatar}
      />
      <div className="message-content">
        <div className="message-meta">
          {`${message.senderName?.trim() || '未知成员'} · ${timeFormatter.format(new Date(message.createdAt))}`}
        </div>
        {messageBody(message, text, hideText)}
        {hasMedia && <img className="media-preview" src={message.previewUrl} alt="" loading="lazy" />}
      </div>
    </article>
  );
}
