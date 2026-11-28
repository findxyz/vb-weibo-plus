# post 页面改为基于 UI SDK 的现代 shadcn/ui 风格

2026-11-28，用户要求将微博页面（`frontend/src/post/`）切换为现代 shadcn/ui 风格，并接入 UI SDK（`@ui-sdk/react` 与 `@ui-sdk/core`）。此决策替代 ADR-0009 与 ADR-0010 中的星空背景皮肤与原生 emoji 控件样式，不改变现有后端接口、查询范围、连续阅读、历史同步及群聊（`chat`）皮肤。

交互组件统一迁移至 `@ui-sdk/react` 无样式原语与 `lucide-react` 矢量图标：模态窗口（添加博主、同步历史、高级搜索、原图查看器）使用 `Dialog`，表单项使用 `Field` 与 `Input`，博主搜索使用 `InputGroup` 与 `InputClear`，右侧日期面板使用 `Calendar` 网格与 `Select` 自定义年月下拉，点赞使用 `Toggle`（未知态使用禁用 `Button`），头像使用 `Avatar`，同步进度使用 `Progress`。

样式全部保持在自包含的 `frontend/src/post/post.css` 中，不引入 Tailwind CSS，避免全局样式重置渗入 `chat.css` 并继续通过 `check-boundaries.mjs` 的单文件 CSS 令牌检查。顶部声明 `@layer ui-sdk;`，色板采用用户指定的 shadcn/ui 预设 `b1ZjA4vKa`（`base-lyra`、`taupe` 暖灰中性色与蓝色主强调色，原生 `oklch()` 浅色／深色语义令牌），在右上角提供浅色／深色主题切换并持久化至本地存储。移除已废弃的 `frontend/src/post/assets/starry-sky.png`。

页面保持 900×560 最小窗口与全视口三栏工作台布局（左栏博主管理、中栏微博流、右栏日期面板），统一 64px 顶栏和 1px 细分隔线，宽屏下正文列限制最大阅读宽度以改善长文可读性。阅读正文继续保持 15px／24px 与 `QuoteFallback` 引号回退。
