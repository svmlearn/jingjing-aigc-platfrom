# 2026-04-30 staging Supabase / Vercel 部署记录

## 目标

使用本地集成分支 `codex/integrate-main-gitee-meng-4.30` 推送 staging 环境：

- Supabase：`jingjing-content-platform-staging`
- Vercel：`jingjing-content-platform-staging`

## 分支与提交

- 当前分支：`codex/integrate-main-gitee-meng-4.30`
- 部署前最新提交：`9804343 docs: record main gitee meng integration handoff`

## Supabase 检查

本地 `app/.env.local` 存在格式不合法变量名字符，Supabase CLI 自动解析时报错：

```text
failed to parse environment file: .env.local (unexpected character '»' in variable name)
```

为避免改动本地 env，使用 `/tmp/jj-supabase-deploy` 临时目录复制 `app/supabase/migrations/`，并重新 link 到 staging project：

```bash
supabase link --project-ref jrveaabguddromjtibbs --yes
supabase migration list
```

检查结果：

- 本地与远端 migration 版本一致。
- 远端已有版本：
  - `202604200001`
  - `202604220001`
  - `202604230001`
  - `202604240001`
  - `202604240002`
  - `202604240003`
  - `202604270001`
  - `202604280001`
- 当前分支没有新增 pending migration。

补充说明：

- `supabase db push --dry-run` 需要 `SUPABASE_DB_PASSWORD`，当前 shell 环境未配置该变量，因此未执行真实 `db push`。
- 因 migration list 已确认本地/远端版本一致，本轮没有实际数据库 migration 被推送。

## Vercel 部署

执行目录：`app/`

```bash
vercel deploy --prod --yes
```

结果：

- Deployment id：`dpl_ErrghtSrWXd2cWiphiphCEEPJtN5`
- Target：`production`
- Status：`Ready`
- Deployment URL：`https://jingjing-content-platform-staging-7u2m47eeh.vercel.app`
- Aliased URL：`https://jingjing-content-platform-staging.vercel.app`

构建结果：

- Next.js production build 成功
- TypeScript 检查通过
- 静态页面生成完成：`47/47`

HTTP 轻量验证：

```bash
curl -I -L https://jingjing-content-platform-staging.vercel.app
```

结果：

- HTTP status：`200`
- Server：`Vercel`
- `x-vercel-cache: PRERENDER`

## 当前状态

- Vercel staging 已部署并 alias 到 staging 域名。
- Supabase staging 未发生新 migration 推送；本地/远端 migration 版本已确认一致。
- 未 push Git 远端。
- 未合并回 `main`。

## 后续注意

1. 如需真实执行 Supabase `db push`，需要先在 shell 中配置 `SUPABASE_DB_PASSWORD`，并再次确认目标是 staging。
2. `app/.env.local` 存在 Supabase CLI 无法解析的变量名字符，后续本地直接跑 Supabase CLI 前需要修正或避开该 env 文件。
3. 如果 staging 运行不符合预期，Vercel 可从 `main` 重新部署或在 Vercel 后台 rollback；Supabase 因本轮没有新增 migration，数据库侧目前无新增回滚动作。
