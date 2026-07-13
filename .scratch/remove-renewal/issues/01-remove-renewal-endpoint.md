Status: ready-for-agent

## Parent

`.scratch/remove-renewal/PRD.md`

## What to build

移除 `/weibo/login/renew` 端点及其编排实现。删除续期编排类（四步链编排：updatetgt -> crossdomain -> 遍历 arrURL 跨域刷新）整文件、续期响应 record（`{boolean success, String message}`，只被续期链和续期测试引用）整文件、续期测试类（整个类只测 `/renew`，三个方法均为 renew 场景，类注释明说"不测 Playwright 扫码 /qr"）整文件。编辑登录 Controller：删除续期编排类与续期响应 record 的 import、续期编排类字段、构造器参数与赋值、`POST /renew` 端点方法，保留 `POST /qr` 不动。

## Acceptance criteria

- [ ] 续期编排类文件已删除
- [ ] 续期响应 record 文件已删除
- [ ] 续期测试类文件已删除
- [ ] 登录 Controller 不再 import 续期编排类与续期响应 record
- [ ] 登录 Controller 不再持有续期编排类字段
- [ ] 登录 Controller 构造器不再注入续期编排类
- [ ] `POST /weibo/login/renew` 端点已移除
- [ ] `POST /weibo/login/qr` 端点保留不变
- [ ] `mvn clean test` 通过
- [ ] `POST /weibo/login/renew` 调用返回 404（端点不存在）

## Blocked by

None - can start immediately
