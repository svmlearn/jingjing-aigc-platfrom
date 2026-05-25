# 2026-05-25 Phase 2G Video Edit Service Supabase Gate Removal

## Scope

本批只处理 Phase 2G：

- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-edit-jobs-service-phase-2g-contract.test.mjs`

本批在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。

未触碰：

- storage / COS / OSS 相关文件
- worker
- package / lockfile
- merchant-media repository 后续实现
- `app/src/lib/supabase/*`
- 主目录 `main`

## Runtime Changes

### Removed Supabase gate

- 删除 `video-edit-jobs-service.ts` 对 `isSupabaseAdminConfigured` / `@/lib/supabase/admin` 的依赖。
- `buildServerManagedInputPayload()` 不再根据 Supabase 是否配置决定 payload 构建路径。
- 删除对 `isPostgresVideoChainEnabled()` 的 payload 分流依赖；当前服务层默认按 app DB 主线加载上下文。

### PostgreSQL / app DB main path

非 local-real-chain 路径现在默认加载：

- `listAssetObjectsByOwner({ ownerType: "content_draft", ownerId: input.draftId })`
- `listMaterialWorkbenchReferencesByDraft({ merchantId, draftId, targetWorkbench: "video" })`
- `getPrivateMediaRepository().listClipsByMerchant({ merchantId })`

随后继续：

- 按 `inputAssetIds` 过滤素材。
- 通过 `filterVideoEditMaterialReferences()` 过滤 video workbench material references。
- 调用 `buildVideoEditJobInputPayload()`，传入 `merchantMediaClips` 和 `requireUserTalkingHead: true`。
- 继续补 `dailyTaskId` / `memberUserId`。
- 继续通过 `attachVoiceProfileReference()` 附加 voice profile ref audio。

### Local real-chain path

local real-chain 仅由 `isLocalRealChainEnabled()` 显式控制：

- local real-chain 分支继续使用 `listLocalRealChainAssetObjectsByOwner()`。
- local real-chain 分支不再借 Supabase configured / not configured 作为 gate。
- 普通 PostgreSQL / app DB 环境不会因为 Supabase 未配置而跳过 material references 或 merchant media clips。

## Tests

新增源码契约测试：

- `app/src/server/api/video-edit-jobs-service-phase-2g-contract.test.mjs`

契约覆盖：

- service source 不再包含 `isSupabaseAdminConfigured`、`createSupabaseAdminClient`、`@/lib/supabase/admin`、`supabase`、`Supabase`。
- `buildServerManagedInputPayload()` 默认 app DB 路径仍加载 assets、material references、merchant media clips。
- 默认路径仍传入 `merchantMediaClips` 和 `requireUserTalkingHead: true`。
- local real-chain 分支只由 `isLocalRealChainEnabled()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/server/api/video-edit-jobs-service-phase-2g-contract.test.mjs
```

结果：3 tests passed。

```bash
cd app && npm run lint -- src/server/api/video-edit-jobs-service.ts src/server/api/video-edit-jobs-service-phase-2g-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "isSupabaseAdminConfigured|createSupabaseAdminClient|@/lib/supabase/admin|supabase|Supabase" app/src/server/api/video-edit-jobs-service.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 未做真实 DB 冒烟。
- 未处理 storage provider / COS / OSS 命名。
- 未处理 worker。
- 未处理 package / lockfile。
- 未处理 `app/src/lib/supabase/*`。
- 未 push，未部署，未合并 main。
