// 前端持久化 key 集中声明：localStorage / sessionStorage 的命名只有这一处定义，
// 防止跨模块撞名与拼写漂移。
export const STORAGE_KEYS = {
  // chat 页上次选中的群（localStorage）
  CHAT_LAST_GROUP: "weibo-chat:last-gid",
  // chat 页沉浸阅读开关（localStorage）
  CHAT_IMMERSIVE: "weibo-chat:immersive",
  // chat 页表态开关（localStorage）
  CHAT_ATTITUDES: "weibo-chat:attitudes",
  // chat 页回归庆祝名单：按群按成员（localStorage）
  CHAT_CELEBRATION_ROSTER: "weibo-chat:celebration-roster",
  // chat 页庆祝基线：按「群:成员」记最后发言时间（localStorage）
  CHAT_CELEBRATION_SEEN: "weibo-chat:celebration-seen",
  // chat 页阅读位前缀，实际 key 为「前缀 + gid」（sessionStorage）
  CHAT_READING_POSITION_PREFIX: "weibo-chat:reading-position:"
};
