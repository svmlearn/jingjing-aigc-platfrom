# 2026-05-26 5.23-worker-fix 合并分支交接

## 当前目标

把 Gitee `jingjing-content-platform` 的 `5.23-worker-fix` 分支合并到本地 `main` 基线之上的隔离分支，先完成冲突收口和验证，不直接合回 `main`。

## 分支与工作区

- Branch: `codex/merge-5-23-worker-fix`
- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-content-platform-merge-5.23-worker-fix`
- Base: local `main` at `dad5a21`
- Merged source: `gitee/5.23-worker-fix` at `56ff772`
- Push: not pushed
- Merge to `main`: not done

## 冲突处理口径

- 禁止 Supabase runtime 回流：删除/拒绝了 Gitee 分支中回流的 Supabase fallback、Supabase skill/deploy artifact、`app/supabase` 新迁移和历史迁移改动。
- 禁止 Tencent COS runtime 回流：worker storage 继续只支持 `aliyun_oss`；只移植 Aliyun OSS signed read URL，不恢复 qcloud/Tencent client。
- 私域素材搜索保留，但落到 PostgreSQL / Aliyun OSS：`merchant-media-repository` 会从 `merchant_media_clips` 和 legacy `source_items + asset_objects` 中读取 `storage_provider = 'aliyun_oss'` 的视频素材，并使用 provider-neutral `storageKey` 字段。
- Voice profile 默认切到 `aliyun_cosyvoice_clone`，保留本地 demo 逻辑和 PostgreSQL transaction 逻辑。
- `productionScenes.durationSeconds` 映射已合入 PostgreSQL mapper。
- 运行面保留当前主线 PostgreSQL / Aliyun OSS 口径；没有引入新的 Supabase / Tencent COS runtime import。

## 验证结果

通过：

- `git diff --cached --check`
- staged diff hard audit: no `createSupabase` / `@/lib/supabase` / Tencent COS SDK / `cosKey` runtime 回流命中
- `cd app && pnpm install --frozen-lockfile`
- `cd app && npm run typecheck`
- `cd app && npm run lint`
- `cd app && node --test src/lib/voice-profile-state-machine.test.ts src/server/api/video-job-payload.test.ts src/server/api/video-script-route-duration.test.ts`
- `cd app && node --test src/server/api/content-generation-batch-service-contract.test.ts src/server/api/dify-final-json-mapper.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-workbench-agent-runtime.test.ts`
- `cd workers/video-worker && python -m unittest tests.test_processor_contract`
- `cd workers/video-worker && python -m unittest tests.test_directive_contract tests.test_firered_generate_voiceover_contract tests.test_openstoryline_engine_adapters`
- `cd workers/video-worker && python -m unittest discover -s tests`

Known validation caveat:

- `node --test src/server/api/private-media-pexels-service.test.ts` 仍会因 Node 直接运行不解析 `@/...` alias 失败；同一命令在当前主目录 `main` 也失败，因此不是本轮合并新增失败。相关服务已由 `typecheck` 和 provider-neutral private media 测试覆盖。

## 下一步建议

1. 人工 review 这个合并 commit 的核心文件，重点看 `merchant-media-repository.ts`、`processor.py`、CosyVoice 相关配置和迁移。
2. 如认可，先 push `codex/merge-5-23-worker-fix` 或在本地对该分支做二次验收。
3. 验收通过后，再由集成人把该分支合回 `main`。
