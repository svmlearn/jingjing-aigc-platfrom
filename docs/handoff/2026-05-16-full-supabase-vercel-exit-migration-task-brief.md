# 2026-05-16 全量去 Supabase / Vercel 迁移任务书

## 1. 决策更新

用户已明确：

```text
最终目标不是只迁视频主链路。
咨询、RAG、知识库、Agent 控制台、向量检索、平台管理等能力也要逐步迁出 Supabase / Vercel，
最终运行在自有服务器 + 普通 PostgreSQL + 对象存储 + 自有 worker 上。
```

因此 `codex/domestic-infra-migration` 不再只是视频链路试验分支，而是国内化 / 自托管全量迁移候选分支。

但仍然保持分阶段：

1. 先备份当前成果到远端分支。
2. 再做全量 Supabase 依赖审计。
3. 再迁 schema / repository / auth / RAG / Agent。
4. 最后才进入阿里云 ECS / RDS / OSS 国内资源验证。

不要把“最终要全迁”误解成“一次性大爆炸改完”。

## 2. 先做远端分支备份

当前本地 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

当前分支：

```text
codex/domestic-infra-migration
```

远端：

```text
gitee git@gitee.com:jingjing_2025/jingjing-content-platform.git
```

执行目标：

```bash
git push -u gitee codex/domestic-infra-migration
```

边界：

- 只 push 到远端同名分支。
- 不 merge 到 `main`。
- 不开正式合并，除非用户明确要求。
- 不写 `DOMESTIC_PHASE1_E2E_PASS`。
- 不标记 long-task complete。

## 3. 全量迁移范围

### 3.1 已经基本迁通的 Phase 1 主链路

这些已经在新加坡 self-hosted staging 通过或基本通过：

- app 自托管运行。
- app-owned session。
- 普通 PostgreSQL core schema。
- 商家 owner 登录。
- 商家团队 / 邀请码 / 成员加入。
- 内容日历 / 每日任务。
- Dify mock 批量生成。
- 成员端任务读取。
- Tencent COS 上传 / 重新签名预览。
- video job 创建。
- worker fast path。
- normal FireRed no-voiceover。
- result asset 写回和预览。

这些能力要继续保持，不允许回退。

### 3.2 必须迁移的 Phase 2 能力

以下当前仍不能称为 PostgreSQL durable，需要正式迁移：

#### 咨询台

目标：

- 咨询会话持久化。
- 用户消息 / Agent 消息持久化。
- 工具调用事件 / roundtable 事件持久化。
- 策略快照 / 内容日历写入与读取走 PostgreSQL。

候选表：

```text
consultation_sessions
consultation_messages
consultation_events
consultation_roundtable_states
consultation_strategy_snapshots
```

#### 商家知识库 / RAG

目标：

- 知识文档持久化。
- chunk 持久化。
- ingestion job 状态持久化。
- 检索不再依赖 Supabase RPC。
- 明确向量方案。

候选表：

```text
knowledge_documents
knowledge_chunks
knowledge_ingestion_jobs
merchant_strategy_assets
```

向量方案二选一：

1. PostgreSQL + `pgvector`
2. 外部向量库

优先建议：

```text
Phase 2 先用 PostgreSQL + pgvector，验证阿里云 RDS PostgreSQL 是否支持 vector 扩展。
如果阿里云 RDS 不支持或性能不够，再评估外部向量库。
```

#### Agent 控制台 / 能力资产

目标：

- Agent 配置持久化。
- prompt / soul 版本持久化。
- skill / knowledge set / route binding 持久化。
- 平台管理端不再依赖 Supabase Admin。

候选表：

```text
platform_admin_users
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
```

#### 平台管理 Auth

目标：

- 不再依赖 Supabase Auth 管理平台管理员。
- 使用 app-owned admin session 或统一 app user + role。

需要决策：

```text
平台管理员是否并入 app_users + role，
还是独立 platform_admin_users + platform_admin_sessions。
```

建议：

```text
先独立 platform_admin_users / platform_admin_sessions，降低对商家成员体系的干扰。
```

#### 导入 / 素材 / 历史记录

目标：

- import_jobs / source_items / imported_comments 已有部分 PostgreSQL path，需要全量审计。
- history hub、素材库、检索路由不能静默 fallback 到 Supabase。

## 4. 存储迁移范围

当前已验证：

```text
Tencent COS ap-singapore
```

最终国内路线倾向：

```text
Aliyun OSS
```

因此需要实现 provider adapter，但顺序在全量 DB 审计之后或并行小步推进。

必须支持：

- `tencent_cos`
- `aliyun_oss`

数据库字段至少保留：

```text
storage_provider
bucket_name
storage_key
storage_metadata
```

不要把 `COS_*` env 复用为 OSS env。

## 5. 推荐执行阶段

### Phase A：远端备份

只做：

```bash
git push -u gitee codex/domestic-infra-migration
```

并记录 push 结果。

### Phase B：全量 Supabase 依赖审计

新增文档：

```text
docs/progress/YYYY-MM-DD-full-supabase-exit-audit.md
```

审计命令建议：

```bash
rg -n "supabase|Supabase|createSupabase|isSupabase|auth\\.admin|match_knowledge_chunks|storage_provider|supabase_storage" app/src app/scripts app/supabase workers/video-worker
```

输出矩阵：

| 模块 | 当前文件 | 当前依赖 | 是否已有 PostgreSQL path | 迁移优先级 | 阻塞点 |
| --- | --- | --- | --- | --- | --- |
| 咨询台 | 待填 | 待填 | 待填 | P0/P1/P2 | 待填 |
| 知识库 / RAG | 待填 | 待填 | 待填 | P0/P1/P2 | 待填 |
| Agent 控制台 | 待填 | 待填 | 待填 | P0/P1/P2 | 待填 |
| 平台管理 Auth | 待填 | 待填 | 待填 | P0/P1/P2 | 待填 |
| 素材 / 导入 / 历史 | 待填 | 待填 | 待填 | P0/P1/P2 | 待填 |

### Phase C：schema migration plan

新增文档：

```text
docs/架构规范/YYYY-MM-DD-selfhost-postgres-full-schema-plan.md
```

内容：

- 从 `app/supabase/migrations` 梳理哪些表要进入 ordinary PostgreSQL baseline。
- 标记 Supabase-only 语法、RLS、auth.users、RPC、vector 的替代方式。
- 输出 migration 顺序。
- 输出 seed / smoke fixture。

### Phase D：P0 代码迁移

先迁 P0：

1. 咨询台持久化。
2. 知识库文档 / chunks / 检索。
3. Agent 控制台核心配置。
4. 平台 admin session。

每迁一个域，都必须：

- 补 schema。
- 补 repository PostgreSQL path。
- 补 smoke。
- 在新加坡 self-hosted staging 跑过。

### Phase E：OSS adapter

实现 Aliyun OSS adapter：

- app upload intent
- browser upload
- media complete
- preview/sign URL
- worker download/upload
- scripts/env templates

先用测试 bucket 做 roundtrip，再跑 worker e2e。

### Phase F：阿里云国内真实资源验证

资源到位后再跑：

- ECS app / worker 部署
- RDS PostgreSQL baseline + seed
- OSS roundtrip
- 手机浏览器 IP e2e
- no-voiceover normal FireRed
- TTS/voiceover 如配置完整再测

## 6. 当前仍不能做的事

不要：

- merge 回 `main`
- 写 `DOMESTIC_PHASE1_E2E_PASS`
- 标记 long-task complete
- 切 `ba-ba-ke.com`
- 启动 ICP
- 使用真实敏感素材
- 声称咨询 / 知识库 / Agent 已 PostgreSQL 持久化
- 声称 Aliyun OSS 已验证

## 7. 下一轮推荐任务

建议下一轮只做两件事：

```text
1. push 远端备份分支。
2. 完成 full Supabase exit audit。
```

不要马上开始大面积代码迁移。

审计完成后，用户和 Agent 再决定：

- Phase 2 是否先迁咨询 / RAG / 知识库。
- 还是先迁 Agent 控制台。
- 还是先做 Aliyun OSS adapter。

