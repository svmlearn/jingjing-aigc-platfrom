# 2026-05-27 咨询 Agent 素材检索工具 handoff

## 目标

在 `codex/consultation-material-search-tools-20260527` worktree 中，为咨询 Agent 新增两个 LLM visible 的只读素材检索工具，并接入 consultation runtime：

- `search_project_video_materials`
- `search_saved_viral_materials`

本轮不修改数据库 schema，不调用外部 TikHub 作为本地爆款库检索，不新增 planner 硬编码流程，不 push、不 merge。

## 已完成

1. 新增两个 consultation tool key，并接入 runtime tool registry、schema 校验、默认参数和 repeatable read tool 判断。
2. `search_project_video_materials` 已 dispatch 到当前商家 ready 视频素材检索：
   - 数据源走 `getPrivateMediaRepository().listClipsByMerchant`，复用 `merchant_media_clips` 和 legacy `source_items + asset_objects` 兼容路径。
   - 支持 `query / limit / orientation / minDurationSeconds / maxDurationSeconds`。
   - 返回紧凑字段：`clipId / assetId / title / description / tags / sceneTags / shotTags / peopleTags / qualityTags / width / height / orientation / durationSeconds / matchReason`。
   - payload 不返回 bucket、storage key、签名 URL 或下载 token。
3. `search_saved_viral_materials` 已 dispatch 到当前商家本地爆款库：
   - 只读 `listMaterialLibraryItems` 中 `usageType=viral_reference` 且 `status=ready` 的 material library 数据。
   - 按需读取 `imported_comments` 匹配评论关键词，并读取 `asset_objects` 生成计数型 `mediaSummary`。
   - 返回 `text` / `textPreview`，不使用 `textSummary`。
   - 返回 `structureMetadata`，只表达 provider/内容形态/媒体 URL 数量/标签/rank/duration 等元数据，不声称创意结构拆解。
   - 不调用外部 TikHub，不新增 provider 结果。
4. 平台默认 consultation enabledTools 加入两个新工具：
   - 对旧 platform settings 做保守补齐：保留已有 enabledTools，仅在没有当前默认版本标记时追加新工具；后续管理员保存会写入版本标记，避免反复覆盖用户显式关闭。
5. 平台设置页工具配置列表新增两个只读工具。
6. 补充 consultation contract test，覆盖新工具 key、registry、strict args、只读检索入口、字段命名约束。
7. Reviewer fix:
   - 修复 `search_project_video_materials` legacy description 泄露风险。
   - 项目视频 tool result 的 title 不再从 `clip.description` 派生，只使用标签白名单。
   - 第一轮曾将项目视频 description 改为安全 scrub；该策略已在 second reviewer fix 中进一步收紧为完全白名单构造，不再返回原文 description。
   - 抽出 `app/src/server/api/consultation-runtime/material-search-tools.ts` 作为无 `server-only` 的纯 payload builder，方便回归测试构造 legacy clip。
   - 新增 legacy 回归测试，序列化 tool result 后断言不含敏感字段和值，不含 `structureSummary/tracePayload` 原始 JSON。
8. Second reviewer fix:
   - `search_project_video_materials` 的模型可见 `description` 已改为真正白名单构造，只拼接 tags、sceneTags、shotTags、peopleTags、qualityTags、orientation、dimensions、duration 等可控字段。
   - 不再在任何 legacy 路径返回 `clip.description` 原文；因当前无法可靠区分新表人工描述与 legacy 拼接描述，本轮统一保守不使用原文 description。
   - `matchReason` 不再读取 `clip.description` 生成命中说明，只使用标签和安全元数据关键词。
   - payload 的 `query` 已单独 scrub，检索仍使用原始 query；模型可见 query 会移除 URL/OSS/长 token，命中敏感 marker 时返回空字符串。
   - 新增无 storage/url/token marker 的 raw metadata 回归测试，覆盖 `structureSummary/tracePayload/importedForEmail/importBatch/providerPayload/engagementSnapshot` 不进入序列化 tool result。

## 改动文件

- `app/src/contracts/knowledge.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/material-search-tools.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/server/api/consultation-service.test.ts`
- `docs/handoff/2026-05-27-consultation-material-search-tools-handoff.md`

## 验证

- `cd app && pnpm install --frozen-lockfile`
  - 通过；worktree 内原本没有 `node_modules`，安装未修改 lockfile。
- `cd app && node --test src/server/api/consultation-service.test.ts`
  - 初次实现通过：60/60。
  - Reviewer fix 后通过：61/61。
  - Second reviewer fix 后通过：62/62。
  - 父线程最终复查通过：62/62。
  - 有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响结果。
- `cd app && npm run typecheck`
  - 初次实现通过；Reviewer fix 后通过；Second reviewer fix 后通过；父线程最终复查通过。
- `git diff --check`
  - 初次实现通过；Reviewer fix 后通过；Second reviewer fix 后通过；父线程最终复查通过，无 whitespace error。
- `rg "textSummary|creative structure|structure breakdown|storageKey|bucketName|signedPreviewUrl|signedDownloadUrl|download token" app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime/tools.ts`
  - 无命中。

说明：任务书里的 `npm test -- --runInBand src/server/api/consultation-service.test.ts` 不适用于当前 `app/package.json`，因为没有 `test` script；按项目既有方式使用 `node --test src/server/api/consultation-service.test.ts`。

## 审查结果

- implementer 完成初版实现后，code-reviewer 第一轮发现 P1：项目视频素材 legacy `clip.description` 可能泄露 storage metadata，要求修复。
- implementer 第一轮修复后，code-reviewer 第二轮仍发现 P1：legacy `clip.description` 即使不含 storage/url marker，也可能暴露 raw JSON metadata，要求改成真正白名单构造。
- implementer 第二轮修复后，code-reviewer 第三轮结论：无阻塞问题，可以进入父线程最终复查。
- 父线程最终复查已完成：未发现新的阻塞问题；注意 `app/src/server/api/consultation-runtime/material-search-tools.ts` 是 untracked 新文件，提交时必须纳入。

## 合并与发布状态

实现审查完成后，用户已要求直接合入本地 `main`。本文件记录实现、审查和验证事实；最终实现 commit 与 main merge commit 以本地 git log 和最终回复为准。

未 push 远端。

## 遗留风险

1. 本轮没有跑真实 `shaokao@163.com` 线上咨询对话 smoke；当前验证是 contract/typecheck 层。
2. fallback bounded planner 仍是旧流程，没有硬编码两个新工具；本轮按任务要求只接入 registry/native/JSON tool loop 路径，planner 清理和增强后续单独做。
3. 本地爆款库 query 会读取最多 160 个 material library 候选，并在素材索引未命中时按需读取评论匹配；如果单商家爆款库远超 160 且命中只存在于更旧评论，仍可能检索不到。

## 交接入口

- worktree: `/Users/wy/.codex/worktrees/consultation-material-search-tools-20260527`
- branch: `codex/consultation-material-search-tools-20260527`
- base: `bf2bbbd83ea8b5b2caca030bfd1d663d37d7d3e7`
- 重点文件:
  - `app/src/server/api/consultation-runtime/tools.ts`
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/platform-admin-repository.ts`
  - `app/src/server/api/consultation-service.test.ts`
- 已知风险:
  - 未做真实账号端到端 smoke。
  - 未提交 commit。
