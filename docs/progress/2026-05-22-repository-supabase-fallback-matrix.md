# 2026-05-22 Repository Supabase Fallback Matrix

## Scope

本阶段只做 repository / service 层 Supabase admin fallback 盘点，不删代码，不进入 storage、worker、package removal。

已读前置文档：

- `docs/progress/2026-05-22-supabase-total-removal-inventory.md`
- `docs/progress/2026-05-22-auth-supabase-removal.md`

执行扫描：

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|supabase\\.from|supabase\\.rpc|cloudSupabaseRequiredError|requireCloudSupabaseAdmin" app/src/lib/db app/src/server --glob '!**/*.test.ts' --glob '!**/*.test.mjs'
```

扫描命中 18 个文件：

- 15 个文件仍有真实 Supabase data access 或 Supabase-only repository branch。
- 1 个 helper 文件只是当前错误口径和旧命名混在一起：`app/src/lib/db/cloud-supabase-required.ts`。
- 1 个 local smoke repository 只用 `isSupabaseAdminConfigured()` 做本地链路开关：`app/src/lib/db/local-real-chain-repository.ts`。
- 1 个 service 文件只用 `isSupabaseAdminConfigured()` 选择旧素材/私域媒体 payload 分支：`app/src/server/api/video-edit-jobs-service.ts`。

## Matrix

| 文件路径 | Supabase 入口 | 业务域 | PostgreSQL 替代路径是否存在 | PostgreSQL path 是否覆盖全部公开函数 | Supabase 当前角色 | 删除风险 | 删除前必须补什么 | 推荐 removal 批次 | 需要补的测试 / smoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `app/src/lib/db/cloud-supabase-required.ts` | `isSupabaseAdminConfigured`, `cloudSupabaseRequiredError`, `requireCloudSupabaseAdmin` | DB helper / 错误口径 | N/A，helper 已按 `isAppPostgresPreferred()` 返回 PostgreSQL 优先错误 | N/A | 不是 data fallback，主要是旧文件名 / 旧函数名误导 | 低 | 新建当前口径 helper，例如 app database required helper；逐步替换 imports 后保留兼容 alias 或一次性改名 | Phase 2E helper 命名清理 | 源码契约：runtime repository 不再 import `cloud-supabase-required`；错误码仍为 PostgreSQL 主线 |
| `app/src/lib/db/content-draft-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `cloudSupabaseRequiredError` | 内容草稿 / 图文视频工作台 | 存在，`isPostgresVideoChainEnabled()` 下调用 `pgCreateManualSourceItem`、`pgCreateDraftWithVariants`、`pgListDraftBundlesByMerchant` 等 | 是，已观察公开函数均先走 PostgreSQL path | PostgreSQL path 后的 fallback | 低 | 删除 fallback 前确认 local-real-chain 调用仍按预期；统一 no-DB 错误口径 | Phase 2A 内容 / 视频工作台 repository | manual source、draft bundle list/get、approve variant、append variant、script update、revision trace contract |
| `app/src/lib/db/video-edit-job-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `cloudSupabaseRequiredError` | 视频剪辑任务 repository | 存在，`isPostgresVideoChainEnabled()` 下调用 `pgCreateVideoEditJob`、`pgListVideoEditJobs`、`pgRetryVideoEditJob`、`pgCancelVideoEditJob` 等 | 是，已观察公开函数均覆盖 | PostgreSQL path 后的 fallback | 低 | 保留/补足 in-flight dedupe、retry/cancel 状态机测试 | Phase 2A 内容 / 视频工作台 repository | create/list/get/retry/cancel；in-flight dedupe；payload 字段 contract |
| `app/src/lib/db/media-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `cloudSupabaseRequiredError` | 通用 asset object / 媒体归属 | 存在，`isPostgresVideoChainEnabled()` 下调用 `pgAssertMediaOwnerAccess`、`pgCreateAssetObject`、`pgListAssetObjectsByOwner` | 是，公开函数已覆盖；`getNextAssetSortOrder` 仅 fallback 内部使用 | PostgreSQL path 后的 fallback | 低 | 补 asset sort order 在 PostgreSQL path 的显式断言；删除 fallback-only helper | Phase 2A 内容 / 视频工作台 repository | owner access 覆盖 source_item/content_draft/content_variant/voice_profile；asset create/list |
| `app/src/lib/db/daily-content-task-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `cloudSupabaseRequiredError` | 日更任务 / 内容日历 | 存在，`isPostgresDailyContentTaskEnabled()` 下直接 query app db | 是，`get/upsert/getById/updateGeneratedContent` 均覆盖 | PostgreSQL path 后的 fallback | 低 | 确认 migration 字段与 Supabase select 字段一致；统一 not configured 错误 | Phase 2A 内容 / 视频工作台 repository | get/upsert/getById/update generated content；商家隔离 |
| `app/src/lib/db/content-generation-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured` | 内容生成 batch/job 队列 | 存在，`isPostgresContentGenerationEnabled()` 下直接 query app db | 是，已观察公开函数均覆盖 | PostgreSQL path 后 fallback；无 Supabase 时还有 demo fallback | 中 | 确认 job claim 并发语义、batch status 汇总、demo fallback 是否仍需要 | Phase 2D 咨询 / 导入 / 内容生成 / voice profile | create batch、claim next、mark succeeded/failed、batch detail、job list |
| `app/src/lib/db/merchant-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `supabase.rpc`, local `cloudSupabaseRequiredError` | 商家 / 邀请码 / 团队 / workspace | 存在，多数函数在 `isPostgresMerchantAuthEnabled()` 或 PostgreSQL preferred path 下调用 `pg*` | 基本覆盖，已观察主公开函数覆盖；fallback 内仍有 Supabase-only helper 组合 | PostgreSQL path 后的 fallback；个别分支在非 PostgreSQL 环境继续使用 legacy helper | 中 | 回归 owner/member invitation、workspace selection、team membership；删除本文件内 local `cloudSupabaseRequiredError` | Phase 2B 商家 / 素材 / 策略 repository | merchant invite redeem、member invite、owner membership、workspace list/select、merchant update |
| `app/src/lib/db/material-library-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured` | 素材库 / provider cache / workbench reference | 存在，`shouldUseAppPostgres()` 下调用 `pg*` material helpers | 基本覆盖，已观察公开 CRUD、provider cache、workbench reference 均覆盖；若干 fallback helper 较多 | PostgreSQL path 后 fallback；无 DB 时 demo fallback | 中 | 对 provider cache、selected references、consume reference 的 PostgreSQL 事务/幂等语义补测试 | Phase 2B 商家 / 素材 / 策略 repository | material item CRUD、provider cache upsert/list、workbench reference create/get/list/consume |
| `app/src/lib/db/merchant-strategy-asset-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured` | 商家策略资产 / 策略文档 | 存在，`shouldUseAppPostgres()` 下直接 query app db | 是，公开 get/upsert/ensure/build markdown 路径可由 PostgreSQL 覆盖 | PostgreSQL path 后 fallback；无 DB 时 demo fallback | 中偏低 | 确认 strategy asset document schema 与当前 RAG/consultation 读取一致 | Phase 2B 商家 / 素材 / 策略 repository | get/upsert/ensure asset/document；Markdown build 保留 canonical/compiled 字段 |
| `app/src/lib/db/merchant-media-repository.ts` | `cloudSupabaseRequiredError`, `createSupabaseAdminClient`, `isSupabaseAdminConfigured` | 商家媒体库 / 私域 Pexels clip | 不存在，当前 factory 直接要求 Supabase admin | 否，`getMerchantMediaRepository()`、`getPrivateMediaRepository()` 仍返回 Supabase repository class | 仍是主路径，不是 fallback | 高 | 先决定是否迁入 PostgreSQL material/media tables，或证明该 legacy 私域媒体路径可删除；处理 `source_cos_key` / `cos_key` 字段迁移口径 | Phase 2B-blocked 或单独 Phase 2C 前置 | merchant media repository contract；merchant-media-manifest service；private-media download；video job server-managed payload |
| `app/src/lib/db/knowledge-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `supabase.rpc` | 知识库 / ingestion / chunks / vector search | 存在，`shouldUseAppPostgres()` 下直接 query app db | 是，已观察 document CRUD、ingestion job、replace chunks、list/search chunks 均有 PostgreSQL path | PostgreSQL path 后 fallback；search fallback 使用 Supabase RPC | 高 | 单独确认 PostgreSQL vector search/ranking 与 Supabase RPC 行为差异；补 chunk replace 事务测试 | Phase 2C 平台管理 / Agent Console / Knowledge | document CRUD、ingestion lifecycle、replace chunks transaction、chunk count/latest job、vector search ranking |
| `app/src/lib/db/platform-admin-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `supabase.from` | 平台管理 / admin user / settings / merchant ops | 存在，`shouldUseAppPostgres()` 下直接 query app db | 基本覆盖，主公开函数和内部 count/event helper 均有 PostgreSQL path；fallback 仍含 Supabase admin auth 用户创建/更新逻辑 | PostgreSQL path 后 fallback，但业务敏感且含旧 auth 语义 | 高 | 验证平台管理员密码哈希/session 语义已经完全 app-owned；补 audit/settings/merchant update 回归 | Phase 2C 平台管理 / Agent Console / Knowledge | admin user list/create/update、invitation code CRUD、merchant update、settings、audit event |
| `app/src/lib/db/agent-console-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `supabase.from` | Agent Console / prompt / soul / skills / knowledge sets / credit usage | 存在，`shouldUseAppPostgres()` 下大量公开函数已接 PostgreSQL path | 基本覆盖但文件体量最大，需函数级复核；扫描显示 40+ 处 Supabase client 调用 | PostgreSQL path 后 fallback；同时存在 demo fallback | 高 | 建函数级 checklist；拆 prompt/soul、skill/binding、knowledge set、route/runtime、credit usage 多组测试 | Phase 2C 平台管理 / Agent Console / Knowledge | agent config CRUD/copy、prompt/soul publish/rollback、skill CRUD/binding、knowledge-set binding、route binding、runtime snapshot/test run、credits/usage |
| `app/src/lib/db/consultation-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured` | 咨询会话 / 消息 / 事件 | 存在，`shouldUseAppPostgres()` 下直接 query app db | 是，公开 session CRUD、message/event 创建，以及内部 detail helper 均观察到 PostgreSQL path | PostgreSQL path 后 fallback；无 DB 时 demo fallback | 中偏高 | 补 session detail 中 messages/events/latest preview 一致性测试；确认删除 fallback 后 demo fallback 策略 | Phase 2D 咨询 / 导入 / 内容生成 / voice profile | session list/create/detail/update/delete、message/event create、latest preview、merchant ownership |
| `app/src/lib/db/import-repository.ts` | `createSupabaseAdminClient` | 导入任务 / source items / imported comments | 存在，`shouldUseAppPostgres()` 下直接 query app db | 是，已观察公开 CRUD、upsert source/comment、list/get 均覆盖；但 fallback 无 `isSupabaseAdminConfigured()` guard | PostgreSQL path 后 fallback，非 PostgreSQL 环境会直接创建 Supabase client | 中 | 删除前确认所有调用环境都设置 app Postgres；补 upsert 幂等和 running count 测试 | Phase 2D 咨询 / 导入 / 内容生成 / voice profile | import job CRUD、running count、source item upsert、comment upsert/list |
| `app/src/lib/db/voice-profile-repository.ts` | `createSupabaseAdminClient`, `isSupabaseAdminConfigured`, `supabase.rpc` | 声音 profile / 音频 asset 绑定 | 存在，`isPostgresVideoChainEnabled()` 或 app Postgres configured 下调用 PostgreSQL helpers | 基本覆盖；音频 asset attach/access 和 current profile 替换需重点确认 | PostgreSQL path 后 fallback；无 Supabase 时有 local fallback | 中 | 验证 current voice profile 替换语义、音频 asset provider 约束、local fallback 是否保留 | Phase 2D 咨询 / 导入 / 内容生成 / voice profile | list/create/access、audio asset assert、replace current profile、provider 字段 contract |
| `app/src/lib/db/local-real-chain-repository.ts` | `isSupabaseAdminConfigured` | 本地 real-chain smoke repository | N/A，本文件本身是 local PostgreSQL smoke path | N/A | 不是 Supabase data fallback；只用 Supabase configured 状态关闭 local mode | 低到中 | 将 gate 改成显式 local env/app DB gate，避免 Supabase package 继续被 runtime 引入 | Phase 2E helper 命名清理 | local real-chain smoke；`LOCAL_REAL_CHAIN_DB_URL` 启停契约 |
| `app/src/server/api/video-edit-jobs-service.ts` | `isSupabaseAdminConfigured` | 视频任务 service / server-managed input payload | 主体 repository 已有 PostgreSQL path；service 内有一段旧路径选择 | N/A，service 非 repository；当前 PostgreSQL 或无 Supabase 时走 assets-only payload，Supabase configured 时走 material refs + private clips legacy branch | service-level legacy branch，不直接访问 Supabase client | 中 | 先处理 `merchant-media-repository.ts` 和 material reference 主线；再决定 server-managed payload 是否继续包含 private clips | Phase 2E 或跟随 Phase 2A/2B 后置 | `video-edit-jobs-service-contract.test`、server-managed payload with material refs/private clips、voice profile attach |

## Risk Buckets

### 低风险可直接删 fallback

这些文件已有 PostgreSQL path，Supabase 只是在 PostgreSQL gate 之后兜底。建议先删并配套小范围 contract/unit 测试：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/daily-content-task-repository.ts`

`app/src/lib/db/content-generation-repository.ts` 也有完整 PostgreSQL path，但它是 worker/queue 语义，建议放到 Phase 2D 而不是第一批。

### 中风险，需要补 PostgreSQL coverage 或行为测试

这些文件已有 PostgreSQL path，但删除 fallback 前需要补幂等、事务、跨表或调用环境测试：

- `app/src/lib/db/merchant-repository.ts`
- `app/src/lib/db/material-library-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/src/lib/db/import-repository.ts`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/lib/db/voice-profile-repository.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/server/api/video-edit-jobs-service.ts`

### 高风险，仍主要依赖 Supabase 或业务面过大

这些文件必须单独处理，不能和低风险 repository 一起机械删除：

- `app/src/lib/db/merchant-media-repository.ts`：当前没有 PostgreSQL repository，factory 直接要求 Supabase admin。它仍被 `merchant-media-manifest-service`、`private-media` download route、`video-edit-jobs-service` 使用。
- `app/src/lib/db/knowledge-repository.ts`：已有 PostgreSQL path，但 Supabase fallback 含 vector RPC，搜索/ranking 需要专门验证。
- `app/src/lib/db/platform-admin-repository.ts`：已有 PostgreSQL path，但 fallback 含旧 admin auth 用户语义和平台管理写操作。
- `app/src/lib/db/agent-console-repository.ts`：文件体量最大，覆盖 Agent config、prompt/soul、skills、knowledge sets、route binding、runtime/test run、credits/usage，多组业务必须拆开验证。

### 只是命名旧，不是真 fallback

- `app/src/lib/db/cloud-supabase-required.ts`：当前错误口径已经 PostgreSQL preferred，但名称和兼容函数仍误导。
- `app/src/lib/db/local-real-chain-repository.ts`：只用 `isSupabaseAdminConfigured()` 控制本地 smoke path 启停，不是 Supabase data fallback。

## Recommended Execution Order

### Phase 2A: 内容 / 视频工作台 repository

先处理低风险、PostgreSQL path 完整、用户链路清晰的文件：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/daily-content-task-repository.ts`

目标：删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` / `cloudSupabaseRequiredError` imports 和 fallback branches，保持 PostgreSQL-only 行为明确。

### Phase 2B: 商家 / 素材 / 策略 repository

再处理商家和素材主链路：

- `app/src/lib/db/merchant-repository.ts`
- `app/src/lib/db/material-library-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`

`app/src/lib/db/merchant-media-repository.ts` 不应直接纳入本批删除。它当前没有 PostgreSQL 替代实现，应该先做方案：补 PostgreSQL repository，或确认私域媒体 legacy path 可以被删除。

### Phase 2C: 平台管理 / Agent Console / Knowledge

单独高风险批次：

- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/agent-console-repository.ts`
- `app/src/lib/db/knowledge-repository.ts`

目标：拆函数组补测试，尤其是平台管理员身份语义、Agent 发布/回滚、knowledge vector search。

### Phase 2D: 咨询 / 导入 / 内容生成 / voice profile

放在高风险平台批次之后或并行小批次处理：

- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/import-repository.ts`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/lib/db/voice-profile-repository.ts`

目标：补事务、幂等、queue claim、音频 asset/provider contract 后删除 fallback。

### Phase 2E: helper 命名和 service legacy branch

最后清理误导性 gate / helper：

- `app/src/lib/db/cloud-supabase-required.ts`
- `app/src/lib/db/local-real-chain-repository.ts`
- `app/src/server/api/video-edit-jobs-service.ts`

目标：把 helper 迁到 app database / object storage 当前口径；移除 service 对 Supabase configured 状态的路径选择。

## Verification

本阶段只新增文档，未修改 app runtime 代码。因此按本阶段要求只需运行：

```bash
git diff --check -- docs/progress/2026-05-22-repository-supabase-fallback-matrix.md
```

未运行 app lint/typecheck，因为本批没有代码改动。
