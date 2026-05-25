# 2026-05-26 Supabase / COS 清理本地合并收尾

## 状态

- 目标分支：`main`
- 来源分支：`codex/remove-supabase-cos-legacy-longrun`
- 本地 merge commit：`8392f5b Merge branch 'codex/remove-supabase-cos-legacy-longrun'`
- 合并后测试路径 follow-up：`b71e44d test: decode storage provider audit paths`
- 当前状态：本地 `main` 已合并，工作区干净。
- Push：未执行。
- 部署：未执行。

## 背景

本轮长任务从商家邀请码注册报 Supabase 旧错误开始，扩展为 Supabase / COS / `supabase_storage` / `tencent_cos` / `cosKey` 运行面残留清理。

长分支已经完成：

- 身份与 session：移除 Supabase Auth fallback，改为 app-owned / domestic session。
- Repository：移除各业务 repository 的 Supabase admin client / `.from(...)` / RPC fallback。
- App Supabase helper：删除 `app/src/lib/supabase/*`、Supabase package 和 env 示例。
- Worker DB env：删除 `SUPABASE_DB_URL` fallback，只保留 `WORKER_DATABASE_URL`。
- Storage provider：当前 app / worker runtime 收敛到 Aliyun OSS / object storage。
- `supabase_storage`：从当前 contract / schema / DTO 默认写入移除。
- `tencent_cos` / Tencent COS：从 app / worker runtime provider、package、script、env 中移除。
- `cosKey` 命名：当前 TypeScript/API 字段切为 `sourceStorageKey` / `storageKey` / `thumbStorageKey`。
- Merchant media DB：新增 forward migration，将当前 repository 使用的列名切到 `source_storage_key` / `storage_key` / `thumb_storage_key`。

详细阶段证据见：

- `docs/progress/2026-05-25-supabase-cos-removal-final-audit.md`

## 本地合并过程

合并前集成检查确认：

- 主目录 `main` 干净。
- 清理分支 `codex/remove-supabase-cos-legacy-longrun` 干净。
- `main` 相比清理分支多两个本地 commit：
  - `979b7e1 chore: add codex subagent workflow`
  - `4def388 chore: remove local deploy and skill artifacts`
- 清理分支相比 `main` 多 40 个 cleanup commit。
- 非落盘 `git merge-tree main HEAD` 预检无冲突。

采用 merge commit，而不是 rebase 或 fast-forward：

```bash
git merge --no-ff codex/remove-supabase-cos-legacy-longrun
```

结果：

```text
8392f5b Merge branch 'codex/remove-supabase-cos-legacy-longrun'
```

合并后发现一个测试 harness 问题：

- `app/src/server/storage/app-storage-provider-phase-3k-contract.test.mjs` 使用 `URL.pathname` 作为文件系统路径。
- 主目录含中文路径时，`file://` pathname 保留 percent-encoding，导致 `readdirSync()` 找不到目录。
- 修复为 `fileURLToPath()` 后提交：

```text
b71e44d test: decode storage provider audit paths
```

该 follow-up 只改测试，不改 runtime / migration。

## 合并后验证

### TypeScript

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

### Storage provider 单文件契约

```bash
cd app && node --test src/server/storage/app-storage-provider-phase-3k-contract.test.mjs
```

结果：5 passed。

### 核心组合契约

```bash
cd app && node --test \
  src/lib/auth/postgres-auth-p0-contract.test.mjs \
  src/server/storage/app-storage-provider-phase-3k-contract.test.mjs \
  src/server/storage/upload-intent-phase-3j-contract.test.mjs \
  src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs \
  src/lib/merchant-media-repository-contract.test.ts \
  src/server/api/merchant-media-manifest-service.test.ts \
  src/server/api/video-job-payload.test.ts
```

结果：61 passed。

说明：当前本机 `node` 为 `v24.4.0`，`.test.ts` entrypoint 可运行，但会出现 `MODULE_TYPELESS_PACKAGE_JSON` warning。该 warning 不是失败。

### Lint / diff check

```bash
cd app && npm run lint -- src/server/storage/app-storage-provider-phase-3k-contract.test.mjs
git diff --check
```

结果：通过。

### Runtime residual scan

```bash
rg -n -S "Supabase|supabase|SUPABASE|@supabase|supabase_storage|tencent_cos|Tencent COS|COS_|cos://|cos-preview|cos-nodejs-sdk-v5|qcloud|WORKER_COS|cos_client|sourceCosKey|thumbCosKey|\bcosKey\b|source_cos_key|thumb_cos_key|\bcos_key\b" \
  app/src app/scripts app/package.json app/pnpm-lock.yaml app/.env.example workers/video-worker \
  --glob '!workers/video-worker/openstoryline/**' \
  --glob '!**/*.test.*' \
  --glob '!**/*contract.test.mjs'
```

结果：无命中。

## 当前结论

本地 `main` 的运行面已经完成 Supabase / COS 清理收口：

- 当前运行代码不再依赖 Supabase runtime/client/package/env。
- 当前运行代码不再保留 Supabase Auth / repository fallback。
- 当前运行代码不再使用 `supabase_storage` 作为当前 provider。
- 当前 app / worker runtime 不再支持 `tencent_cos` / Tencent COS provider。
- 当前 app / worker runtime 不再使用 `COS_` / `WORKER_COS` env。
- 当前 upload intent 和 merchant-media API 字段不再使用 `cosKey` / `sourceCosKey` / `thumbCosKey`。
- 当前 merchant-media repository 不再使用 `source_cos_key` / `cos_key` / `thumb_cos_key` DB 列名。

历史资料仍会命中旧词，包括：

- `docs/handoff/**`
- `docs/progress/**`
- `app/supabase/migrations/**`
- 旧 `app/db/migrations/**`
- `workers/video-worker/openstoryline/**` vendor 目录

这些是历史记录、迁移历史或 vendor 内容，不作为 runtime blocker。

## 部署前人工检查

部署前必须先检查真实数据库是否满足 guarded migrations 条件。

至少确认：

```sql
select storage_provider, count(*)
from asset_objects
group by storage_provider;

select storage_provider, count(*)
from knowledge_documents
group by storage_provider;
```

要求：

- 没有 `storage_provider = 'supabase_storage'`。
- 没有 `storage_provider = 'tencent_cos'`。

merchant-media 列名迁移前后还要确认目标环境当前 schema 状态：

- 执行 `202605250004_rename_merchant_media_storage_key_columns.sql` 前，如果是旧列，应存在：
  - `merchant_media_assets.source_cos_key`
  - `merchant_media_clips.cos_key`
  - `merchant_media_clips.thumb_cos_key`
- 执行后，应存在：
  - `merchant_media_assets.source_storage_key`
  - `merchant_media_clips.storage_key`
  - `merchant_media_clips.thumb_storage_key`

如果真实 DB 中仍有旧 provider 数据，guarded migration 会主动失败；不要绕过 guard 直接改约束。

## 剩余事项

代码层面本轮已收口。剩余事项不属于本地代码清理：

1. 是否 push 本地 `main` 到远端。
2. 是否在测试 / 生产数据库执行 guarded migrations。
3. 是否做真实浏览器登录、邀请码注册、素材上传、AI 剪辑链路 smoke。
4. 是否清理或归档历史 `app/supabase/migrations/**`。当前按用户口径保留。

## 最终状态

```text
branch: main
HEAD: b71e44d test: decode storage provider audit paths
git status: clean
push: no
deploy: no
```
