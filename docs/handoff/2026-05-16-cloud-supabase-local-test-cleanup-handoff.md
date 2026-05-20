# 2026-05-16 云端 Supabase 本地兜底清理 Handoff

## 当前目标

将 app 运行时收紧为必须使用部署在云端的 Supabase。允许本地启动 Next.js，但 `.env.local` 必须指向云端 Supabase；不再允许缺少 Supabase 时通过本地 demo、local-real-chain、本地超管、memory store 或 fixture secret 继续跑业务链路。

## 已完成内容

- 删除 `LOCAL_REAL_CHAIN_*` 本地真实链路测试桥接配置与 `app/src/lib/db/local-real-chain-repository.ts`。
- 删除 `app/src/lib/demo/local-demo-runtime.ts`。
- 移除 `pg` / `@types/pg` 依赖。
- 新增 `app/src/lib/db/cloud-supabase-required.ts`，统一抛出云端 Supabase 必需错误。
- 收紧 `getAuthenticatedUser`、商家登录、商家后台 layout、商家 onboarding、merchant login API：未配置 Supabase 时不再创建 demo 用户或放行。
- 移除平台后台 localhost 本地超管 fallback。
- 将 repository / service 中未配置 Supabase service role 时返回本地 demo / memory 数据的运行时 fallback 改为明确报错。
- 私有素材下载 token secret 不再使用本地 fixture secret 兜底。
- 删除误落盘的 `app/supabase/supabase/` 本地 CLI 临时目录，并在 `.gitignore` 忽略。
- 更新架构文档和 progress 记录。

## 验证结果

在 `D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14\app` 执行：

- `corepack pnpm typecheck` 通过。
- `corepack pnpm lint` 通过。
- 本地 Supabase / local demo / 本地桥接 / 无 Supabase Auth 兜底关键字搜索未命中运行时桥接入口。

## 已合并状态

- 源工作区：`D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14`
- 源分支：`孟_5.13_5.14`
- 清理提交：`6567964 fix: require cloud supabase runtime`
- 目标工作区：`D:\codexplan\personal\jingjing-content-platform`
- 目标分支：`孟_5.13`
- 本地 merge commit：`67cda50 merge: require cloud supabase runtime`
- Push：未 push。

## 保留项

- 用户明确要求“后台不要动”后，平台后台 UI 中的 `platform-admin-mock` 样本引用未继续处理。
- 商家端旧 dashboard 详情 / 改写 / 草稿页面仍有 `mock-api` 引用；当前主入口 `/dashboard/content` 已走真实接口。若要彻底消除运行时 mock 页面，建议后续单独收口这些旧路由。
- 目标工作区 `孟_5.13` 合并前已有未跟踪 progress/artifacts 文件，本轮未纳入提交。
- 源工作区仍有与本轮无关的 worker、SQL 临时文件、`.agents` 等脏改动，本轮未纳入合并。

## 下一步建议

1. 如需继续“所有运行时 mock 归零”，下一轮只处理商家旧 dashboard mock 路由，平台后台按用户确认范围再决定是否处理。
2. 在云端 Supabase 环境变量齐全的本地环境做一次登录到商家主链路的浏览器 smoke test。
3. 合并已在本地完成，确认无误后再由用户决定是否 push。
