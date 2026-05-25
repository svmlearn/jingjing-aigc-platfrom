# 2026-05-22 Phase 2B Merchant Repository Supabase Fallback Removal

## Scope

本批只处理：

- `app/src/lib/db/merchant-repository.ts`

未触碰：

- `app/src/lib/db/merchant-media-repository.ts`
- material-library / merchant-strategy / knowledge / platform-admin / agent-console
- storage provider / worker / package removal
- `app/src/lib/supabase/*`

## Runtime Changes

`merchant-repository.ts` 已删除 Supabase admin fallback，变为 PostgreSQL app DB 主线 wrapper。

已删除：

- `createSupabaseAdminClient`
- `isSupabaseAdminConfigured`
- `supabase.rpc("redeem_invitation_code", ...)`
- 所有 Supabase `.from()` fallback branches
- 本文件内 local `cloudSupabaseRequiredError()`
- fallback-only row types、select constants、mapper/helper：
  - invitation code fallback mapper
  - team member fallback mapper
  - team invitation fallback mapper
  - missing relation helpers
  - legacy invite redemption error mapper

保留：

- `mapMerchantProfile()`，因为 `platform-admin-repository.ts` 仍复用它映射 merchant profile row。
- `assertMerchantOperational()` 和 owner/team guard，继续保持现有业务错误码。
- `normalizeMemberInvitationCode()` / `generateMemberInvitationCode()`，用于 owner 创建成员邀请码前生成/规范化当前项目的 `TEAM-*` code。

## PostgreSQL Coverage

公开函数和 PostgreSQL helper 对应关系：

| `merchant-repository.ts` | PostgreSQL helper / path |
| --- | --- |
| `createInvitationCode()` | `pgCreateInvitationCode()` |
| `redeemInvitationCode()` | `pgRedeemInvitationCode()` |
| `getMerchantProfileById()` | `pgGetMerchantProfileById()` |
| `getMerchantProfileByOwnerUserId()` | `pgGetMerchantProfileByOwnerUserId()` |
| `listActiveMerchantTeamMembersByMerchant()` | `pgListActiveMerchantTeamMembersByMerchant()` |
| `getMerchantTeamManagementForOwner()` | `getOperationalMerchantWorkspaceByUserId()` + `listActiveMerchantTeamMembersByMerchant()` + `listMerchantTeamInvitationCodesByMerchant()` |
| `createMemberInvitationCodeForOwner()` | owner workspace guard + `pgCreateMemberInvitationCodeForOwner()` |
| `listMerchantTeamInvitationCodesByMerchant()` | `pgListMerchantTeamInvitationCodesByMerchant()` |
| `getMerchantWorkspaceByUserId()` | `pgGetMerchantWorkspaceByUserId()` |
| `listOperationalMerchantWorkspacesByUserId()` | `pgListMerchantWorkspacesByUserId()` + active merchant filter |
| `selectOperationalMerchantWorkspaceForUser()` | `pgSelectMerchantWorkspaceForUser()` + `assertMerchantOperational()` |
| `acceptMemberInvitationCode()` | `pgAcceptMemberInvitationCode()` |
| `updateMerchantProfile()` | `pgUpdateMerchantProfile()` |
| `getOperationalMerchantProfileByOwnerUserId()` | workspace lookup + `assertMerchantOperational()` |
| `getOperationalMerchantWorkspaceByUserId()` | workspace lookup + `assertMerchantOperational()` |

PostgreSQL 未配置时由 `queryAppDb()` / `getAppPostgresPool()` 抛当前 `APP_DATABASE_NOT_CONFIGURED` 口径，不再由本文件返回 legacy Supabase fallback 错误。

## Tests

新增：

- `app/src/lib/db/merchant-repository-phase-2b-contract.test.mjs`

契约覆盖：

- `merchant-repository.ts` 不再包含 legacy admin fallback 字符串。
- owner invite / owner profile / profile update 公开函数委托 `pg*` helper。
- team members / member invitation / team invitation code 链路委托 `pg*` helper。
- workspace list/select 和 operational guard 仍存在。
- 保留的 local helpers 不含 legacy fallback 文案。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/merchant-repository-phase-2b-contract.test.mjs
```

结果：5 tests passed。

```bash
cd app && npm run lint -- \
  src/lib/db/merchant-repository.ts \
  src/lib/db/merchant-repository-phase-2b-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|supabase\\.from|supabase\\.rpc|cloudSupabaseRequiredError|@/lib/supabase|Supabase|supabase|redeem_invitation_code" app/src/lib/db/merchant-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- `merchant-media-repository.ts` 仍未处理，保持矩阵中的高风险 / Supabase-only 状态。
- 未 push，未部署。
