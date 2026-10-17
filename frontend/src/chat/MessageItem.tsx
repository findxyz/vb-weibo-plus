import { useState } from 'react';
import Avatar from './Avatar';
import MessageText from './MessageText';
import WeiboCard, { type WeiboUrlObject } from './WeiboCard';
import { emojiSource } from './emoji';
import type { Attitude, ChatMessage } from './api';

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

// 表态贴图缺失时的近似符号，与旧页的 ATTITUDE_ICONS 同源。
const ATTITUDE_ICONS: Record<string, string> = {
  good: '👍', '点赞': '👍', '赞啊': '👍', '干杯': '🍺',
  '心': '❤️', '给你小心心': '💗', '送花花': '💐', '爱慕': '😘', '憧憬': '😍',
  '太开心': '😆', '哈哈': '😃', '嘻嘻': '😁', '哇': '🤩', '期待': '🤞',
  '抱一抱': '🤗', '来抱抱': '🫂', '鼓掌': '👏', '求饶': '🙏', '打call': '🙌',
  '彩虹屁': '🌈', '不愧是你': '💯', 'yeah': '🥳', '比耶': '✌️', '努力': '💪',
};

// 与旧 message-view.js 一致：这些占位文案在媒体消息里不重复显示。
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

type Props = {
  message: ChatMessage;
  isAdmin: boolean;
  onOpenImage: (url: string) => void;
};

function attitudeChips(attitudes: Attitude[]) {
  return attitudes
    .filter(attitude => attitude?.name && (attitude.count ?? 0) > 0)
    .map(attitude => {
      const name = attitude.name as string;
      const sticker = emojiSource(`[${name}]`);
      return (
        <span key={name} className={`attitude-chip${attitude.selected ? ' selected' : ''}`} title={name}>
          {sticker
            ? <img className="attitude-chip-icon" src={sticker} alt={name} loading="lazy" />
            : <span aria-hidden="true">{ATTITUDE_ICONS[name] ?? name}</span>}
          {attitude.count}
        </span>
      );
    });
}

export default function MessageItem({ message, isAdmin, onOpenImage }: Props) {
  const [playing, setPlaying] = useState(false);
  const isSystem = message.senderName?.trim() === SYSTEM_SENDER;
  const hasVideo = Boolean(message.videoUrl) && Boolean(message.previewUrl);
  const hasImage = Boolean(message.previewUrl) && !hasVideo;
  const hasMedia = hasVideo || hasImage;
  const text = message.text?.trim() ? message.text : `[${message.msgTypeName || '消息'}]`;
  const hideText = hasMedia && HIDDEN_CAPTIONS.has(message.text?.trim() ?? '');
  const attitudes = attitudeChips(message.attitudes ?? []);

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
        {hasImage && (
          <button type="button" className="media-preview" aria-label="查看原图"
            onClick={() => onOpenImage(message.originalUrl || message.previewUrl)}>
            <img src={message.previewUrl} alt="" loading="lazy" />
          </button>
        )}
        {hasVideo && !playing && (
          <button type="button" className="media-preview video-preview" aria-label="播放视频"
            onClick={() => setPlaying(true)}>
            <img src={message.previewUrl} alt="" loading="lazy" />
            <span aria-hidden="true">▶</span>
          </button>
        )}
        {hasVideo && playing && (
          <video className="message-video" src={message.videoUrl} controls preload="metadata"
            aria-label="群聊视频" autoPlay />
        )}
        {attitudes.length > 0 && <div className="message-attitudes">{attitudes}</div>}
      </div>
    </article>
  );
}
