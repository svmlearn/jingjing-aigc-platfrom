# 2026-05-15 个人声音覆盖本地合同进展

## 目标

落实 `05-个人克隆声音与覆盖.md` 和 `07-测试验收纠错与上线.md` 中的个人声音硬门禁：

- `created_by_user_id` 是个人声音使用边界。
- 同一 `merchant_id + created_by_user_id` 只有一个当前 ready 音色。
- 覆盖成功后旧音色归档并进入 cleanup。
- provider 失败时旧音色继续可用。
- Supabase / 真实 RunningHub clone key 缺失不阻塞本轮合同验证。

本记录只覆盖个人声音本地合同切片，不代表全量 `private-media-dify-full-run` Completion Gate 已完成。

## 已完成

- 新增纯业务状态机 `app/src/lib/voice-profile-state-machine.ts`，不依赖 Supabase、Next server runtime 或真实 provider。
- 状态机覆盖：
  - mock RunningHub clone 成功后创建新 ready profile。
  - 同一用户旧 ready profile 自动归档。
  - 归档旧 profile 时产生 cleanup job。
  - mock RunningHub clone 失败时不替换旧 profile。
  - 同一个预分配 profile id + audio 的重复提交幂等返回当前 profile。
  - 跨用户访问 voice profile 被拒绝。
  - profile id 被其他用户占用时拒绝。
- 本地 repository adapter 复用同一状态机；Supabase 未配置时走 in-memory store。
- 当前代码中的 provider 名称继续使用 `pixelle_clone`，按 RunningHub clone 适配名 / 历史名处理，没有拆成另一个 Pixelle provider。
- 保留当前 Supabase adapter / RPC 方向作为可选实现；业务规则不以 Supabase API key 或 service role 为硬依赖。

## Mock / Real 说明

- RunningHub clone：本切片使用 mock provider result 验证 success / failure / cleanup 合同；未调用真实 RunningHub clone。
- Supabase：本切片使用纯状态机和 in-memory repository 规则验证；未要求 Supabase app keys 或 service role。
- 服务器 `/srv/jingjing-video-worker/.env`：本切片未做真实 server smoke，也未判定 RunningHub clone key 缺失。真实 RunningHub clone smoke 后置记录。

## 验证

- `node --test src/lib/voice-profile-state-machine.test.ts`
  - 5 passed。
  - Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告，未影响测试结果。
- `./node_modules/.bin/tsc --noEmit`
  - 通过。

## 未完成 / 后置

- 真实 RunningHub clone provider smoke 尚未执行；如需要只能在服务器环境用 SET / EMPTY 预检密钥，不打印值。
- Supabase migration / RPC 未做真实 staging smoke；如果后续替换 Supabase，应保留当前 repository interface 并把状态机接到新的 Postgres / repository adapter。
- pending 超时清理、真实音频解析校验、provider cleanup 失败重试仍需后续切片补齐。
- 全量 Dify、商家素材库、Pexels-compatible、OpenStoryline 私有素材链路仍未完成。

## 回滚点

若该切片引入异常，可回退以下文件恢复到此前本地 repository 逻辑：

- `app/src/lib/voice-profile-state-machine.ts`
- `app/src/lib/voice-profile-state-machine.test.ts`
- `app/src/lib/db/voice-profile-repository.ts`
- `app/supabase/migrations/202605150001_voice_profile_current_replacement.sql`
