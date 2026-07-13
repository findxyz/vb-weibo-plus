Status: ready-for-agent

## Parent

`.scratch/remove-renewal/PRD.md`

## What to build

清理因移除续期编排类而产生的死代码。编辑 Cookie 持有者：删除续期合并方法（合并 Set-Cookie，双重过滤 domain=.weibo.com + name=SSOLoginState，同步 ALF）及其方法注释；删除只服务于该方法的三个私有辅助方法（cookie 串解析、按固定顺序拼回、单字段追加）；删除因该方法而存在的 import（List、LinkedHashMap、Map），仅当 get/set/init 不依赖它们时删；类注释中"续期链回写"改为"扫码登录回写"；保留 get/set/init/cookie 字段/@PostConstruct 不动。编辑常量类：删除续期专用 header 组（UA + Referer: weibo.com，注释"续期链 4 步"）；类注释"五组 header"改为"四组 header"；保留 AJAX/WEBIM/MSGET/DIRECT 四组不动。

## Acceptance criteria

- [ ] Cookie 持有者的续期合并方法已删除
- [ ] 只服务于该方法的三个私有辅助方法（cookie 串解析、按固定顺序拼回、单字段追加）已删除
- [ ] 因该方法而存在的 import（List、LinkedHashMap、Map）已删除（仅当 get/set/init 不依赖时）
- [ ] Cookie 持有者类注释"续期链回写"已改为"扫码登录回写"
- [ ] Cookie 持有者的 get/set/init/cookie 字段/@PostConstruct 保留不变
- [ ] 常量类的续期专用 header 组已删除
- [ ] 常量类类注释"五组 header"已改为"四组 header"
- [ ] 常量类 AJAX/WEBIM/MSGET/DIRECT 四组保留不变
- [ ] `mvn clean test` 通过
- [ ] `grep -rn "mergeRenewal\|HEADERS_RENEW"` 在 `src/` 下零命中

## Blocked by

- `.scratch/remove-renewal/issues/01-remove-renewal-endpoint.md`（mergeRenewal 只被续期编排类调用，删了编排类后才成死代码）
