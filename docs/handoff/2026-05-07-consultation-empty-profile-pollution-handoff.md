# 2026-05-07 咨询 Agent 空资料污染修复 handoff

## 当前目标

修复新商家空资料进入咨询台时，被自动写成“本地服务 / 本地生活服务”的问题，并清理 `ywangyangw1@163.com` 这一个新账号的错误运行态。

## 当前分支

- Branch：`codex/fix-empty-consultation-strategy`
- Worktree：主项目目录

## 已完成

1. 确认根因：
   - 用户资料为空；
   - 代码初始化策略资产时用了 `本地服务 / 本地生活服务` 兜底；
   - active Agent prompt 仍是“本地生活商家”口径；
   - 错误策略资产进入共享上下文后，被 Agent 当成事实继续扩写。
2. 代码修复：
   - 空资料初始化为空策略资产；
   - 首轮问候不再替用户假设行业；
   - 策略快照生成不再用本地生活服务兜底；
   - 默认 consultation prompt 改为中性口径；
   - 新增 Supabase migration 修正已部署环境配置。
3. 数据清理：
   - 仅处理 `ywangyangw1@163.com / young`；
   - 商家基础资料未改；
   - 删除 2 条错误咨询会话；
   - 重置 merchant strategy asset 为空；
   - 更新线上 active prompt。
4. 验证通过：
   - `node --test src/server/api/consultation-service.test.ts`
   - `pnpm typecheck`
   - `pnpm lint`
   - `git diff --check`

## 改动文件

- `app/src/server/api/consultation-service.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/supabase/migrations/202605070003_consultation_empty_profile_guardrails.sql`
- `docs/progress/2026-05-07-consultation-empty-profile-pollution-fix.md`
- `docs/handoff/2026-05-07-consultation-empty-profile-pollution-handoff.md`

## 下一步建议

1. 用户刷新咨询页后，应该自动创建一条新咨询会话。
2. 新首轮回复应先问用户是谁、主营业务和当前问题，不应出现本地服务默认结论。
3. 如果确认效果正确，再决定是否提交、push、部署。

## Push / Merge

- push：未执行
- merge：未执行

