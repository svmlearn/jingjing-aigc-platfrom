# 2026-05-16 P0 自托管 PostgreSQL Foundation Schema 实装任务

## 1. 任务目标

在 `codex/domestic-infra-migration` 上实现 P0 自托管 PostgreSQL foundation schema。

这不是大面积迁 repository，也不是声明全量迁移完成。

本轮目标：

```text
把咨询、知识库/RAG、Agent 控制台、平台管理 Auth、平台设置、策略资产
所需的基础表，以 additive migration 的方式加入 ordinary PostgreSQL。
```

完成后，现有新加坡 self-hosted DB 和未来阿里云 RDS 空库都应该能得到同一套基础表。

## 2. 当前状态

当前分支：

```text
codex/domestic-infra-migration
```

当前本地最新提交：

```text
45d7134 docs: add selfhost postgres schema plan
```

注意：当前本地分支比 Gitee 远端 ahead 1。开始代码前先 push 这个 docs commit 备份：

```bash
git push gitee codex/domestic-infra-migration
```

不要 merge 到 `main`。

## 3. 必读文档

```text
docs/progress/2026-05-16-full-supabase-exit-audit.md
docs/架构规范/2026-05-16-selfhost-postgres-full-schema-plan.md
docs/progress/2026-05-16-singapore-selfhost-product-surface-audit.md
docs/progress/2026-05-16-singapore-selfhost-weekend-product-qa.md
```

主仓任务书参考：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/handoff/2026-05-16-p0-selfhost-postgres-schema-plan-task-brief.md
```

## 4. 实现范围

### 4.1 新增 additive migration

新增文件，建议：

```text
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

不要只修改旧 baseline。原因：

- 现有新加坡 rehearsal DB 已经初始化过，需要 additive migration。
- 未来空库可以按顺序执行 `app/db/migrations/*.sql`。
- 旧 baseline 可保留为第一阶段起点。

如果需要更新 `app/db/README.md`，说明现在应按文件名顺序执行所有 migration。

### 4.2 本轮应创建的表

按 schema plan 实装以下 P0 表：

平台管理 Auth：

```text
platform_admin_users
platform_admin_sessions
```

咨询台：

```text
consultation_sessions
consultation_messages
consultation_events
consultation_roundtable_states
```

商家策略资产：

```text
merchant_strategy_assets
```

知识库 / RAG 基础：

```text
knowledge_documents
knowledge_chunks
knowledge_ingestion_jobs
```

平台设置 / 事件：

```text
platform_settings
platform_admin_events
```

Agent 控制台 foundation：

```text
agent_configs
agent_prompt_versions
agent_soul_versions
agent_skills
agent_skill_bindings
knowledge_sets
knowledge_set_documents
agent_knowledge_set_bindings
agent_route_bindings
agent_test_runs
agent_runtime_snapshots
```

素材引用：

```text
material_workbench_references
```

### 4.3 pgvector optional migration

不要把 pgvector 强塞进 foundation migration。

新增可选 migration，建议：

```text
app/db/migrations/202605160002_selfhost_pgvector_optional.sql
```

要求：

- 可以包含 `create extension if not exists vector;`
- 如果需要 `knowledge_chunks.embedding vector(...)`，放在 optional migration。
- 如果目标数据库不支持 pgvector，foundation migration 仍必须可用。

如果目前不确定 embedding 维度，optional migration 可以先只写注释和安全检查，不强行加字段。

### 4.4 不做 repository 迁移

本轮不要迁这些代码：

- `consultation-repository.ts`
- `knowledge-repository.ts`
- `agent-console-repository.ts`
- `platform-admin-session.ts`

除非为了 migration smoke 增加很小的只读脚本。

## 5. 验证要求

### 5.1 本地空库验证

用临时 PostgreSQL 空库验证：

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
psql "$APP_DATABASE_URL" -f app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

如果实现 optional pgvector migration：

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605160002_selfhost_pgvector_optional.sql
```

如果本地环境没有 pgvector，optional 失败不能影响 foundation 结论，要记录清楚。

### 5.2 新加坡现有 DB 验证

在新加坡 self-hosted DB 上只应用 additive foundation migration：

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

或通过 `jingjing-selfhost-pg` 容器执行等价命令。

验证：

```sql
select to_regclass('public.platform_admin_users');
select to_regclass('public.consultation_sessions');
select to_regclass('public.knowledge_documents');
select to_regclass('public.agent_configs');
select to_regclass('public.material_workbench_references');
```

### 5.3 不回归现有主链路

至少重跑：

```text
/api/health
app env preflight
team invite + Dify mock smoke
video-chain API smoke
worker fast-path smoke
normal no-voiceover FireRed smoke 如时间允许
```

本轮可以不跑 TTS/voiceover。

## 6. 交付文档

新增：

```text
docs/progress/YYYY-MM-DD-selfhost-p0-foundation-schema.md
docs/handoff/YYYY-MM-DD-selfhost-p0-foundation-schema-handoff.md
```

必须写清：

- 新增 migration 文件。
- 哪些表已创建。
- 是否修改 baseline README。
- 本地空库验证结果。
- 新加坡 additive migration 结果。
- pgvector optional 是否执行、是否支持。
- 哪些 repository 仍未迁。
- long-task 仍 blocked。
- push / merge 状态。
- 最终 commit。

## 7. 禁止事项

不要：

- merge 到 `main`
- 写 `DOMESTIC_PHASE1_E2E_PASS`
- 标记 long-task complete
- 切 `ba-ba-ke.com`
- 启动 ICP
- 改真实业务大逻辑
- 声称咨询/知识库/Agent 已完成迁移
- 实现 Aliyun OSS adapter

## 8. 下一轮之后的推荐路线

foundation schema 通过后，下一轮再开始第一批 repository 迁移：

```text
1. platform admin app-owned session
2. consultation repository PostgreSQL path
3. merchant_strategy_assets PostgreSQL path
4. knowledge_documents/chunks text fallback PostgreSQL path
```

