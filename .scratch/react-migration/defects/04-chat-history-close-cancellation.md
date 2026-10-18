# chat 聊天记录关闭时取消请求

日期：2026-10-18。来源：[任务 34 整页验收](../issues/34-chat-page-acceptance.md)。

## 复现与原因

打开 Historical Browse，以本地替身挂起查询或 Historical Capture，然后关闭窗口。原实现只调用父级 onClose，没有使请求版本失效或中止 AbortController。浏览器的请求仍在等待；迟到结果还可更新隐藏窗口或触发登录失效回调。

旧实现关闭函数会推进请求版本。React 的 Analysis 窗口也已有关闭时的版本隔离和取消处理，Historical Browse 遗漏了同样的生命周期处理。

## 修复与证据

HistoryDialog 的原生 close 事件处理先增加版本、取消当前请求，再通知父级。关闭按钮和 Escape 共用这条路径，不改变后端采集语义；取消浏览器等待不表示撤销已经发出的采集。

新增查询和采集两项真实浏览器回归：挂起请求，关闭窗口，验证 requestfailed 事件，再打开时检查初始状态与采集按钮恢复。修复前两项均失败（未取消），修复后通过。三尺寸组合路径另验证嵌套图片模态、两次 Escape 的焦点恢复、独立阅读、草稿和过滤词保持。

日志：.scratch/react-migration/chat-34-red.log、chat-34-green.log。日志为本地生成文件；回归已纳入 frontend/tests/chat.spec.ts。
