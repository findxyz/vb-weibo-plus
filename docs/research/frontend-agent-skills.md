# 前端 Coding Agent Skill 调研

调研日期：2026-09-11

## 结论

所有条目均已对照一手来源（GitHub 仓库与 SKILL.md 原文）核实，未核实或已失效的条目不收录。本项目前端是 `src/main/resources/static` 下的原生 HTML/CSS（无构建步骤、无 React/Vue/Tailwind），因此推荐以「无框架依赖、面向设计与审查」的 skill 为主，React 专属 skill 暂不推荐。

最值得安装的 4 个（按优先级）：

1. **frontend-design**（Anthropic 官方）——通用视觉设计指导，无框架依赖，专门防止「AI 味」模板化 UI，与本项目「两套皮肤令牌」的设计方式契合；在 skills.sh 排行榜安装量 876.4K，是设计类第一。
2. **web-design-guidelines**（Vercel 官方）——对已有 UI 代码按 100+ 条 Web Interface Guidelines 规则做静态审查（可访问性、焦点状态、表单、动画、暗色模式、触控、i18n 等），适合 chat 页和 post 页改完后的自查；与内置 browser-use 的「动态浏览器操作」互补（一个审代码，一个开浏览器验证）。
3. **web-quality-audit**（Addy Osmani，Google Chrome 团队）——Lighthouse 式的质量审计，结合浏览器实测证据与源码检查，覆盖性能、可访问性、SEO、最佳实践，适合上线前检查。
4. **find-skills**（vercel-labs）——「用来找 skill 的 skill」，安装量 3.4M 全榜第一；装上后 agent 可按当前任务自行检索 skills.sh 目录，后续补充 skill 不需要再人工调研。

暂缓安装：**webapp-testing**（Anthropic）与 **agent-browser**（Vercel）分别与内置的 web-gui-tester、control-browser 能力重叠，本项目暂无 Playwright 脚本化测试诉求；**vercel-react-best-practices**、**vercel-composition-patterns** 仅在项目引入 React 后才有价值。

## 完整清单

每条包含：来源（直达链接）、用途、获取或启用方式、适用场景。安装方式一栏中，`npx skills add` 是 [skills.sh](https://skills.sh/) 生态的通用命令，适用于 ZCode、Claude Code 等 Agent Skills 兼容工具；手动方式是把 skill 目录复制到用户级 skills 目录（本机为 `C:\Users\fixyz\.zcode\skills\`）或工作区级 skills 目录。

### Anthropic 官方：anthropics/skills

来源：<https://github.com/anthropics/skills>（Apache 2.0，文档类 skill 为 source-available）。`skills/` 目录共 19 个条目，前端相关如下。

| Skill | 用途（引至 SKILL.md/README） | 获取或启用 | 适用场景 |
| --- | --- | --- | --- |
| frontend-design | 「Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.」指导做出有个性、不像模板或 AI 生成的 UI，含两遍式令牌规划流程（先出令牌方案再批评再实现） | `npx skills add anthropics/skills`，或复制该 skill 目录；Claude Code 亦可 `/plugin marketplace add anthropics/skills` 后 `/plugin install example-skills@anthropic-agent-skills` | 新建或重塑页面视觉；给 chat/post 页这类手写 CSS 页面定设计方向 |
| webapp-testing | 「Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.」 | 同上 | 为本地 Web 应用写 Playwright 测试脚本、排查 UI 行为；与内置 web-gui-tester 重叠，需要可留存的自动化脚本时才值得装 |
| web-artifacts-builder | 「Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies.」React 18 + TypeScript + Vite + Tailwind + shadcn/ui 的单文件打包工具链 | 同上 | 产出 claude.ai 演示用 HTML artifact；与本项目生产代码无关 |
| theme-factory、canvas-design、brand-guidelines | 主题生成、PNG/PDF 视觉创作、品牌规范应用（设计向辅助） | 同上 | 需要生成主题或视觉素材时按需取用 |

### Vercel 官方：vercel-labs/agent-skills

来源：<https://github.com/vercel-labs/agent-skills>（README 自述「Vercel's official collection of agent skills」，约 31K stars）。

| Skill | 用途（引至 SKILL.md/README） | 获取或启用 | 适用场景 |
| --- | --- | --- | --- |
| web-design-guidelines | 「Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX"...」100+ 条规则，覆盖可访问性、焦点、表单、动画、排版、图片、性能、导航与状态、暗色模式、触控、i18n | `npx skills add vercel-labs/agent-skills`（可整仓安装后按需启用） | 对已有页面代码做审查；配合 `docs/design/DESIGN.md` 令牌做合规自查 |
| vercel-react-best-practices | React/Next.js 性能优化 40+ 条规则、8 类，按影响排序（消除瀑布请求、包体积、服务端性能、重渲染等）；skills.sh 安装量 705.3K | 同上 | 仅当项目引入 React/Next.js 时 |
| vercel-composition-patterns | React 组合模式：布尔 prop 泛滥时的重构、复合组件、render props、context provider、组件 API 设计，含 React 19 API 变化 | 同上 | 仅当项目引入 React 且要设计组件库时 |
| react-view-transitions、react-native-skills、writing-guidelines、vercel-optimize、deploy-to-vercel | 视图过渡、React Native、文档写作审查、Vercel 项目成本/性能审计、部署 | 同上 | 视栈而定；writing-guidelines 面向 Vercel 写作手册，非必需 |

### Addy Osmani（Google Chrome 团队）

两个仓库，前端相关度最高。

**addyosmani/agent-skills**（约 93K stars）：来源 <https://github.com/addyosmani/agent-skills>，25 个工程 skill。前端相关条目：

| Skill | 用途（引至 SKILL.md/README） | 获取或启用 | 适用场景 |
| --- | --- | --- | --- |
| frontend-ui-engineering | 「Builds production-quality, accessible, responsive user-facing UIs... when the output needs to look and feel production-quality rather than AI-generated.」 | `npx skills add addyosmani/agent-skills --skill frontend-ui-engineering` | 手写生产级页面/组件时的综合工程规范 |
| browser-testing-with-devtools | 用 Chrome DevTools 做浏览器测试 | `npx skills add addyosmani/agent-skills --skill browser-testing-with-devtools` | 与内置 browser-use 部分重叠，需要 DevTools 协议层操作时再装 |
| performance-optimization | 性能优化通用方法 | `npx skills add addyosmani/agent-skills --skill performance-optimization` | 后端（Java）与前端均适用的性能排查 |

**addyosmani/web-quality-skills**（约 2.8K stars）：来源 <https://github.com/addyosmani/web-quality-skills>，自述「Agent Skills for optimizing web quality based on Lighthouse and Core Web Vitals」。

| Skill | 用途（引至 SKILL.md） | 获取或启用 | 适用场景 |
| --- | --- | --- | --- |
| web-quality-audit | 「Run an evidence-led web quality audit covering performance, accessibility, SEO, best practices, and agentic browsing.」结合浏览器实测证据与源码检查 | `npx skills add addyosmani/web-quality-skills` | 上线前对 chat/post 页做整体质量审计 |
| performance、core-web-vitals、accessibility、seo、best-practices | 上述四类各自独立的专项 skill（LCP/INP/CLS、WCAG、结构化数据等） | 同上 | 需要单项深查时按需安装 |

### 其他厂商

| Skill | 来源 | 用途 | 获取或启用 | 适用场景 |
| --- | --- | --- | --- | --- |
| angular-developer、angular-new-app | <https://github.com/angular/skills>（Angular 官方，README 自述与 Gemini CLI/Antigravity 等 Agent Skills 兼容工具配合） | 生成符合最新 Angular 版本的代码与架构指导，覆盖 signals、表单、SSR、可访问性等 | `npx skills add https://github.com/angular/skills` | 本项目不用 Angular，仅作官方 skill 生态参考 |

### Skill 发现与安装工具

| 名称 | 来源 | 用途 | 获取或启用 | 适用场景 |
| --- | --- | --- | --- | --- |
| skills（CLI） | <https://github.com/vercel-labs/skills>（自述「The open agent skills tool - npx skills」，约 31K stars） | 跨 agent 的 skill 安装器，`npx skills add <owner/repo>` 即装 | `npx skills` | 安装上面所有 skill 的通道 |
| find-skills | <https://github.com/vercel-labs/skills>（仓库内 `skills/find-skills`） | agent 按任务在 skills.sh 目录中自行检索、推荐 skill；skills.sh 安装量 3.4M，全榜第一 | `npx skills add vercel-labs/skills` | 想让 agent 自己持续补充能力时 |
| skills.sh 目录 | <https://skills.sh/> | Agent Skills 开放目录与排行榜，可按热度浏览真实安装量 | 浏览器访问 | 安装前查安装量与来源 |
| agent-browser | <https://github.com/vercel-labs/agent-browser>（约 42K stars，自述「Browser automation CLI for AI agents」，skills.sh 安装量 831.1K） | 面向 agent 的浏览器自动化 CLI | `npx skills add vercel-labs/agent-browser` | 与内置 control-browser 重叠，本会话无需安装 |

### 社区汇总列表（二手来源，用于浏览而非直接安装）

- ComposioHQ/awesome-claude-skills（约 74.9K stars）：<https://github.com/ComposioHQ/awesome-claude-skills>
- hesreallyhim/awesome-claude-code（约 53.9K stars）：<https://github.com/hesreallyhim/awesome-claude-code>
- VoltAgent/awesome-agent-skills（约 34.1K stars，按官方团队分类整理，含 Google Chrome/Addy Osmani、Angular、GSAP、Figma 等条目索引）：<https://github.com/VoltAgent/awesome-agent-skills>
- travisvn/awesome-claude-skills（约 15.0K stars）：<https://github.com/travisvn/awesome-claude-skills>

列表中的第三方条目质量参差，本文只收录了能回溯到一手仓库并读到 SKILL.md 的条目。检索时未找到 shadcn 官方 skill 仓库；Tailwind 相关社区 skill（如 Lombiq/Tailwind-Agent-Skills）与本项目技术栈不符，均不推荐。

## 与本会话内置能力的边界

ZCode 本会话已内置 browser-use（control-browser、web-gui-tester）、prototype、show-me、tdd 等 skill。边界如下：

- 内置 control-browser/web-gui-tester 覆盖「打开浏览器操作与验证」：webapp-testing、agent-browser 与之重叠，不装。
- 内置 prototype 覆盖「一次性原型验证设计」：frontend-design 与之互补——frontend-design 管视觉方向与令牌规划，prototype 管快速试错。
- 内置 tdd 覆盖测试先行开发：webapp-testing 只在其产物（Playwright 脚本）需要长期留存时才有增量价值。
- 无内置对应、值得新增的是审查类：web-design-guidelines（代码静态审查）与 web-quality-audit（浏览器实测审计）。

## 参考链接

- anthropics/skills：<https://github.com/anthropics/skills>
- anthropics/skills — frontend-design SKILL.md：<https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md>
- anthropics/skills — webapp-testing SKILL.md：<https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md>
- anthropics/skills — web-artifacts-builder SKILL.md：<https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md>
- vercel-labs/agent-skills：<https://github.com/vercel-labs/agent-skills>
- vercel-labs/agent-skills — web-design-guidelines SKILL.md：<https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md>
- addyosmani/agent-skills：<https://github.com/addyosmani/agent-skills>
- addyosmani/web-quality-skills：<https://github.com/addyosmani/web-quality-skills>
- angular/skills：<https://github.com/angular/skills>
- vercel-labs/skills（npx skills CLI 与 find-skills）：<https://github.com/vercel-labs/skills>
- vercel-labs/agent-browser：<https://github.com/vercel-labs/agent-browser>
- skills.sh 排行榜与目录：<https://skills.sh/>
- ComposioHQ/awesome-claude-skills：<https://github.com/ComposioHQ/awesome-claude-skills>
- hesreallyhim/awesome-claude-code：<https://github.com/hesreallyhim/awesome-claude-code>
- VoltAgent/awesome-agent-skills：<https://github.com/VoltAgent/awesome-agent-skills>
- travisvn/awesome-claude-skills：<https://github.com/travisvn/awesome-claude-skills>
