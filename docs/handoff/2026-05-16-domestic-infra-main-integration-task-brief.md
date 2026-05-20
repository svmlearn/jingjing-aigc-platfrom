# 2026-05-16 国内化分支与最新 main 集成任务书

## 1. 任务目的

本任务书给 `codex/domestic-infra-migration` 分支使用。

不要把任务理解成一句“把最新 main 同步进去”。正确目标是：

```text
在保留新加坡 self-hosted rehearsal 已验证能力的前提下，
审计并集成 main 上最近新增的主链路能力，
让国内化分支继续成为可迁移、可验收、可回退的候选基线。
```

当前已知：

- 新加坡 self-hosted rehearsal 已在 `codex/domestic-infra-migration` 通过。
- 当前通过范围是：Next.js 自托管、普通 PostgreSQL、app-owned session、COS、video-worker、OpenStoryline / FireRed、浏览器上传、job、成片、重新签名预览。
- 国内真实 Phase 1 仍未完成。
- `.codex/long-task/active.json` 仍应保持 `blocked`。
- 不要写 `DOMESTIC_PHASE1_E2E_PASS`。
- 不要 push / merge / 切 `ba-ba-ke.com`，除非用户明确要求。

## 2. 工作区和分支

主仓库，作为最新产品和 main 参考源：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

国内化 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

目标分支：

```text
codex/domestic-infra-migration
```

当前国内化分支重要 commit：

```text
70bb15b455ee20a21b4d195e1e38211df5cd32de
docs: record singapore self-hosted rehearsal
```

## 3. 必读文档顺序

先读主仓库文档，理解最新产品和架构决策：

```text
AGENTS.md
docs/README.md
docs/协作/W-M同学协作README.md
docs/产品文档/V2.1-咨询驱动主链路体验补强-PRD.md
docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md
docs/产品文档/V2.3-内容日历驱动图文视频生成PRD.md
docs/产品文档/V2.3.1-中介成员端任务执行与自动成片PRD.md
docs/产品文档/V2.4-内容检索与媒体素材分层路由PRD.md
docs/产品文档/V2.4-声音克隆未来计划.md
docs/产品文档/2026-05-12-MVP北极星计划.md
docs/架构规范/2026-04-28-current-architecture.md
docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md
docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md
docs/架构规范/2026-05-13-国内化改造分支冻结与恢复断点.md
docs/架构规范/2026-05-15-选题到内容生成全链路产品总纲.md
```

再读 main 最近新增能力的 handoff / progress：

```text
docs/handoff/2026-05-13-video-workbench-json-contract-cleanup-handoff.md
docs/handoff/2026-05-14-dify-calendar-member-integration-handoff.md
docs/handoff/2026-05-14-dify-member-team-management-handoff.md
docs/handoff/2026-05-14-server-purchase-domestic-migration-zero-memory-handoff.md
docs/progress/2026-05-10-v2.3-team-content-calendar-implementation.md
docs/progress/2026-05-11-v2.3.1-member-app-implementation.md
docs/progress/2026-05-13-cos-run-timestamp-result-mapping.md
docs/progress/2026-05-13-dify-siliconflow-deepseek-v32-test.md
docs/progress/2026-05-14-dify-calendar-member-integration.md
```

最后读国内化分支自己的最新证据：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-16-singapore-self-hosted-rehearsal-handoff.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/progress/2026-05-16-singapore-self-hosted-rehearsal-redeploy.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-15-singapore-self-hosted-rehearsal-runbook.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/progress/2026-05-15-singapore-self-hosted-rehearsal.md
```

## 4. main 上必须纳入评估的新能力

不要只机械 merge。先按能力域梳理差异。

### 4.1 Dify 内容日历批量生成

相关文件线索：

```text
app/src/server/api/dify-final-json-mapper.ts
app/src/server/api/dify-workflow-client.ts
app/src/server/api/content-generation-batch-service.ts
app/src/lib/db/content-generation-repository.ts
app/src/app/api/content-generation/batches/route.ts
app/src/app/api/content-generation/jobs/run-next/route.ts
app/supabase/migrations/202605140001_content_generation_batches_jobs.sql
app/src/components/member/member-workspace.tsx
app/src/components/merchant/daily-tasks-workspace.tsx
app/src/contracts/content-generation.ts
app/src/contracts/daily-task.ts
```

集成判断：

- 这属于当前主链路，不应在国内化分支里丢失。
- 如果继续使用普通 PostgreSQL，必须补对应 schema / repository，或明确记录为暂时 Supabase-only blocker。
- 不要伪造 Dify 真实调用通过；可以先用 mock final JSON 做 self-host smoke。

### 4.2 商家团队成员和邀请码

相关文件线索：

```text
app/src/app/api/merchant-team/route.ts
app/src/app/api/merchant-team/invitation-codes/route.ts
app/src/app/dashboard/team/page.tsx
app/src/components/app/dashboard-shell.tsx
app/src/components/merchant/team-management-workspace.tsx
app/src/contracts/merchant.ts
app/src/lib/db/merchant-repository.ts
app/src/server/api/schemas.ts
```

集成判断：

- 这是 owner -> 成员 -> 内容日历 -> Dify 一周内容生成链路的前置能力。
- 国内化分支如果只保留 disposable owner 登录，会挡住后续真实团队流程。
- 必须确认 PostgreSQL baseline 里有邀请码、成员、团队关系所需表和约束。

### 4.3 视频 job 展示、结果预览和进度契约

相关文件线索：

```text
app/src/app/api/media/cos-preview/route.ts
app/src/app/api/video-edit-jobs/[id]/result/[assetId]/route.ts
app/src/server/api/video-job-public-dto.ts
app/src/server/api/video-job-public-dto.test.ts
app/src/server/api/video-job-public-route-contract.test.ts
app/src/lib/ui/video-progress-modules.ts
app/src/lib/ui/video-progress-modules.test.ts
app/src/lib/ui/video-job-display.ts
app/src/components/merchant/video-workbench.tsx
app/src/components/dashboard/draft-video-panels.tsx
app/src/contracts/video.ts
```

集成判断：

- 这是 self-hosted rehearsal 里“页面重新签名预览 / 下载”的用户可见层。
- 国内化分支不能只保证 DB 和 worker 成功，也要保证新 UI 和 result route 可用。
- 注意签名 URL 不能长期保存，数据库只保存 bucket/object key。

### 4.4 FireRed / OpenStoryline 稳定性修复

相关文件线索：

```text
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/openstoryline/app/main.py
workers/video-worker/worker/app/openstoryline_client.py
workers/video-worker/worker/app/processor.py
workers/video-worker/openstoryline/firered/agent_fastapi.py
workers/video-worker/openstoryline/firered/src/open_storyline/mcp_connections.py
workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
workers/video-worker/openstoryline/firered/src/open_storyline/mcp/sampling_requester.py
```

集成判断：

- main 里有 FireRed streaming / progress / worker contract 的修复。
- domestic 分支里有 self-hosted rehearsal fast path 和普通 FireRed 成功证据。
- 合并时不能互相覆盖。特别注意：
  - normal `staging_worker` 路径必须保留。
  - `self_hosted_rehearsal_fast_path` 只能作为显式测试路径。
  - 不得让生产任务误走 fast path。

### 4.5 Supabase 仍存在的模块

需要审计，不要求本轮全部迁完：

```text
platform admin / agent console
knowledge repository
consultation repository
material library repository
daily content task repository
部分 auth / onboarding / register-with-invite
```

输出时必须分清：

```text
已迁到普通 PostgreSQL
已在 self-hosted smoke 覆盖
仍依赖 Supabase，但不阻塞本轮主链路
仍依赖 Supabase，且会阻塞下周国内 staging
```

## 5. 存储路线特别注意

当前国内化分支和新加坡 rehearsal 仍是 Tencent COS：

```text
COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
WORKER_COS_*
storage_provider = tencent_cos
```

但最新决策里，正式国内资源倾向：

```text
阿里云 ECS + RDS PostgreSQL + OSS
```

因此本轮至少要输出一个明确判断：

1. 如果下周一确定买阿里云 OSS，代码需要做 storage provider adapter。
2. 需要覆盖：
   - app 上传凭证
   - 浏览器直传
   - media complete
   - worker 下载输入素材
   - worker 上传 final.mp4 / cover / subtitles
   - 重新签名预览 / 下载
   - smoke scripts
   - env templates
3. 如果本轮不实现 OSS adapter，必须在 handoff 里把它列为下周一国内资源验证前的 blocker。

不要把 Tencent COS rehearsal 说成已覆盖 Aliyun OSS。

## 6. 推荐执行方式

### Phase A：只做集成审计

先产出一份短审计，不改大代码：

```text
docs/progress/YYYY-MM-DD-domestic-main-integration-audit.md
```

审计至少包含：

- `git log --left-right --cherry-pick --oneline HEAD...main` 的结论摘要。
- main 新能力清单。
- domestic 分支已有能力清单。
- 可能冲突文件清单。
- PostgreSQL baseline 需要补哪些表。
- 仍依赖 Supabase 的模块分级。
- OSS adapter 是否必须前置。

### Phase B：在 domestic 分支集成 main

确认边界后再做代码集成。

推荐顺序：

1. 在 `codex/domestic-infra-migration` 上处理。
2. 先保存当前 clean 状态和 commit hash。
3. 合入 main 的新增业务能力时，按能力域解决冲突，不要盲目保留某一侧。
4. 对新增 Supabase migration，补普通 PostgreSQL baseline / repository。
5. 对新 UI / API route，确认 app-owned session 和 PostgreSQL 模式下可用。
6. 运行本地验证。
7. 再部署到新加坡服务器做 self-hosted 集成 rehearsal。

## 7. 最小本地验证

必须通过：

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
deploy/domestic/scripts/verify-templates.sh
git diff --check
```

需要补充：

```text
普通 PostgreSQL baseline 能初始化空库。
seed 能创建 disposable owner / merchant。
owner login 能走 app-owned session。
Dify content generation mock job 能落库并被成员端读出。
merchant team invite API 在 PostgreSQL/self-host 模式下可用，或明确列为 blocker。
video upload -> media complete -> video job -> worker -> result preview 仍通过。
```

## 8. 新加坡 self-hosted 回归

完成集成后，在新加坡服务器回归：

```text
http://43.160.208.189
```

至少覆盖：

- `/api/health`
- owner 登录
- 团队/邀请码相关 API smoke
- Dify 内容生成 mock 或真实小样 smoke
- 成员端一周任务读取
- 浏览器 COS 直传
- video job 创建
- worker claim / normal FireRed 小任务
- final.mp4 / cover / subtitles 上传
- 页面重新签名预览

不要使用真实敏感用户素材、自拍视频、声音克隆素材。

## 9. 交付物

完成后至少新增或更新：

```text
docs/progress/YYYY-MM-DD-domestic-main-integration.md
docs/handoff/YYYY-MM-DD-domestic-main-integration-handoff.md
```

交付文档必须写清：

- 目标
- 读过的 PRD / 架构 / handoff / progress
- 已集成 main 的哪些能力
- 哪些能力仍 Supabase-only
- PostgreSQL baseline / repository 调整
- 是否实现 OSS adapter；如果没有，为什么、何时做
- 新加坡 self-hosted 回归结果
- 国内真实 Phase 1 是否仍 pending
- push / merge 状态
- 最终 commit

## 10. 禁止事项

不要：

- 写 `DOMESTIC_PHASE1_E2E_PASS`
- 标记 `.codex/long-task` complete
- 声称国内 Phase 1 完成
- 切 `ba-ba-ke.com`
- 启动 ICP
- 点击采购 / 备案 / 协议确认类最终提交按钮
- push / merge，除非用户明确要求
- 把 Supabase-only 模块写成已经迁移
- 把 Tencent COS rehearsal 写成 Aliyun OSS 已验证

