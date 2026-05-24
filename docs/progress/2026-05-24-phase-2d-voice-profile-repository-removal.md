# 2026-05-24 Phase 2D Voice Profile Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2D 第一小批：

- `app/src/lib/db/voice-profile-repository.ts`
- `app/src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs`

未触碰 `agent-console-repository.ts`、`merchant-media-repository.ts`、`import-repository.ts`、`consultation-repository.ts`、`content-generation-repository.ts`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `voice_profiles` 的 Supabase `.from(...)` fallback。
- 删除 `asset_objects` 的 Supabase `.from(...)` fallback。
- 删除 `replace_current_voice_profile` Supabase RPC fallback。
- 删除基于 Supabase 配置缺失触发的 local fallback 判断。

### PostgreSQL app DB path

- `listVoiceProfiles()` 非 local demo 时直接查询 `public.voice_profiles`，再调用 `attachVoiceProfileAssets()` 附回 `refAudioAsset`。
- `createVoiceProfile()` 保留 app DB transaction：
  - 先检查指定 id 是否已存在并锁定。
  - 如果 id 已存在但商家、创建人、ref audio 或 ready 状态不一致，继续抛 `VOICE_PROFILE_ID_CONFLICT`。
  - 创建新 profile 前，将同一 `merchant_id + created_by_user_id` 下旧 `ready` profile 归档为 `archived`。
  - 插入新的 `ready` / `pixelle_clone` profile。
  - 返回 DTO 时继续附回已校验的 `refAudioAsset`。
- `assertVoiceProfileAccess()` 非 local demo 时直接查询 `public.voice_profiles`，只允许当前 merchant/user 下 `ready` profile。
- `assertVoiceProfileAudioAsset()` 直接查询 `public.asset_objects`，要求：
  - `owner_type = 'voice_profile'`
  - `owner_id = voiceProfileId`
  - `asset_type = 'audio'`
  - `storage_provider in ('tencent_cos', 'aliyun_oss')`
  - 继续通过 `assertVoiceProfileAudioStorageKey()` 校验 storage key 归属前缀。
- `attachVoiceProfileAssets()` 直接查询 `public.asset_objects` 并按 `refAudioAssetId` 附回 DTO。

### Local demo fallback

保留 voice profile 的内存 fallback，但只在 `isLocalDemoRuntime()` 下触发：

- `listVoiceProfiles()` 在 local demo 下读取 `localVoiceProfileStore`。
- `createVoiceProfile()` 在 local demo 下仍会归档同 merchant/user 的旧 `ready` profile，并写入新的内存 `ready` profile。
- `assertVoiceProfileAccess()` 在 local demo 下读取内存 store。

该 fallback 不再依赖 Supabase 配置判断。音频资产校验和 asset attachment 的当前主线统一为 app DB `public.asset_objects` 查询。

## Schema

未新增 migration。当前本批依赖既有 app DB migration：

- `app/db/migrations/202605190002_selfhost_voice_profiles.sql`
- 既有 `asset_objects` baseline / provider 相关 migration

未连接真实 DB 做数据确认；本批只移除 repository fallback 并用源码契约与类型检查确认主线代码路径。

## Tests

新增源码契约测试：

- `app/src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`、`.rpc(`。
- 关键函数仍存在：
  - `listVoiceProfiles`
  - `createVoiceProfile`
  - `assertVoiceProfileAccess`
  - `assertVoiceProfileAudioAsset`
  - `attachVoiceProfileAssets`
- PostgreSQL 主路径仍包含 `queryAppDb`、`withAppDbTransaction`、`public.voice_profiles`、`public.asset_objects`。
- 创建路径仍保留授权校验、旧 ready profile 归档、新 ready profile 插入和 `refAudioAsset` 附回。
- audio asset 校验仍覆盖 owner/type/provider 和 storage key 归属。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/voice-profile-repository.ts src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase/admin|supabase|Supabase|\.from\(|\.rpc\(" app/src/lib/db/voice-profile-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Review Follow-up: Local Demo Create Path

Review 发现 `createVoiceProfile()` 在进入 `isLocalDemoRuntime()` 分支前先调用 `assertVoiceProfileAudioAsset()`，而该函数已经改为无条件查询 app DB `public.asset_objects`。这会导致无数据库 local demo 创建 voice profile 时直接失败，实际走不到内存 fallback。

已补修：

- `createVoiceProfile()` 现在先完成 `VOICE_PROFILE_AUTHORIZATION_REQUIRED` 授权校验。
- local demo 分支在任何 app DB 查询前执行。
- local demo 分支通过 `createLocalDemoVoiceProfileAudioAsset()` 构造 synthetic `refAudioAsset`：
  - `ownerType = "voice_profile"`
  - `ownerId = voiceProfileId`
  - `assetType = "audio"`
  - `storageProvider = "aliyun_oss"`
  - `storageKey = voice-profiles/{merchantId}/{voiceProfileId}/local-demo-ref-audio.wav`
  - `sortOrder = 0`
  - `createdAt` / `updatedAt` 使用当前时间
- synthetic asset 构造后仍调用 `assertVoiceProfileAudioStorageKey()`，保持路径归属约束。
- 非 local demo 的 PostgreSQL 主线不变：仍先 `assertVoiceProfileAudioAsset()`，再用 transaction 归档旧 `ready` profile 并插入新 `ready` profile。

契约测试新增：

- `createVoiceProfile()` 的 local demo 分支源码顺序必须早于 `assertVoiceProfileAudioAsset({`。
- local demo 分支里不得出现 `queryAppDb`、`withAppDbTransaction` 或 `assertVoiceProfileAudioAsset`。
- synthetic local demo audio asset 必须满足 owner/type/provider/storageKey/sortOrder/timestamp/path assertion 约束。

## Retained / Not Touched

- 保留 voice profile local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 暂未清理 `tencent_cos` provider contract；本批只保留当前 voice profile audio asset 既有主线允许值 `tencent_cos` / `aliyun_oss`，storage provider 契约会在后续 storage provider 阶段单独处理。
- 未处理 agent-console / merchant-media。
- 未处理 import / consultation / content-generation。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
