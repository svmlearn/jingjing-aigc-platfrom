# 2026-05-16 P0 自托管 PostgreSQL 全量 Schema 方案任务书

## 1. 当前决策

用户已确认最终目标是全量迁出 Supabase / Vercel，不只迁视频主链路。

当前 `codex/domestic-infra-migration` 已经：

- 推送到 Gitee 远端同名分支备份。
- 完成视频主链路 + 团队 + Dify mock + 内容日历 + 成员任务的新加坡 self-hosted QA。
- 完成 full Supabase exit audit。

下一步不要直接大面积写代码。

正确下一步是先做 P0 schema plan：

```text
把咨询、知识库/RAG、Agent 控制台、平台管理 Auth、策略资产、向量检索
从 Supabase-only 迁到 ordinary PostgreSQL 所需的表结构、替代语义、迁移顺序、风险和验证命令写清楚。
```

## 2. 工作区

继续使用：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

分支：

```text
codex/domestic-infra-migration
```

远端备份：

```text
gitee/codex/domestic-infra-migration
```

当前参考 HEAD：

```text
9ad332b docs: add full supabase exit audit
```

## 3. 必读文档

先读最新审计：

```text
docs/progress/2026-05-16-full-supabase-exit-audit.md
```

再读当前 self-hosted QA：

```text
docs/progress/2026-05-16-singapore-selfhost-product-surface-audit.md
docs/progress/2026-05-16-singapore-selfhost-weekend-product-qa.md
docs/handoff/2026-05-16-singapore-selfhost-weekend-product-qa-handoff.md
```

再读产品和架构真相源：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.1-咨询驱动主链路体验补强-PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.1-商家知识库与咨询上下文补强-PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.2-咨询Agent控制台与能力资产管理PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-04-28-current-architecture.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-05-consultation-agent-assets-context-design.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-06-consultation-agent-native-tool-loop-design.md
```

最后读 Supabase migrations：

```text
app/supabase/migrations/
app/db/migrations/202605130001_domestic_core_baseline.sql
```

## 4. 本轮目标

新增一份架构方案：

```text
docs/架构规范/YYYY-MM-DD-selfhost-postgres-full-schema-plan.md
```

建议文件名：

```text
docs/架构规范/2026-05-16-selfhost-postgres-full-schema-plan.md
```

本轮只做方案和必要的只读审计，不做大面积代码迁移。

## 5. 方案必须覆盖的 P0 域

### 5.1 咨询台持久化

必须设计：

- `consultation_sessions`
- `consultation_messages`
- `consultation_events`
- roundtable state 是否独立表，还是继续放事件 payload
- 会话归属：merchant / owner / member
- 工具调用事件、失败事件、阶段总结如何存

需要替代：

- Supabase repository
- 内存 fallback

### 5.2 商家策略资产

必须设计：

- `merchant_strategy_assets`
- 策略快照与咨询会话的关系
- 策略资产与内容日历 / daily tasks 的同步边界

### 5.3 知识库 / RAG

必须设计：

- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`
- 文本 memory 和文件型 document 是否统一
- chunking 状态、错误、重试
- 引用来源：platform / merchant
- 与 agent knowledge set 的绑定关系

### 5.4 向量检索

必须给出明确路线：

优先路线：

```text
PostgreSQL + pgvector
```

必须说明：

- 是否需要 `create extension vector`
- embedding 维度如何配置
- 索引用 `ivfflat`、`hnsw` 还是先不用索引
- `match_knowledge_chunks` Supabase RPC 如何替换
- 如果阿里云 RDS PostgreSQL 不支持 pgvector，fallback 是什么

### 5.5 平台管理 Auth

必须设计：

- `platform_admin_users`
- `platform_admin_sessions`
- bootstrap super admin
- password hash
- session cookie
- role / status
- admin user create/update/disable 如何替代 Supabase Auth Admin

注意：

```text
不要继续依赖 auth.users。
不要把平台 admin 强行塞进商家 app_users，除非方案明确解释为什么。
```

推荐：

```text
独立 platform_admin_users / platform_admin_sessions。
```

### 5.6 Agent 控制台 / 能力资产

必须设计：

- `agent_configs`
- `agent_prompt_versions`
- `agent_soul_versions`
- `agent_skills`
- `agent_skill_bindings`
- `knowledge_sets`
- `knowledge_set_documents`
- `agent_knowledge_set_bindings`
- `agent_route_bindings`
- `agent_test_runs`
- `agent_runtime_snapshots`

需要说明：

- 哪些 P0 必须先迁。
- 哪些 P1 可以后置。
- 与知识库表的依赖关系。

### 5.7 平台设置 / 事件

必须设计：

- `platform_settings`
- `platform_admin_events`

重点：

- LLM runtime
- import runtime
- membership plans
- consultation agent config
- script production config
- knowledge runtime

### 5.8 素材 / 导入写路径

必须设计：

- `material_workbench_references`
- `import_jobs` 写路径补齐
- `source_items` / `imported_comments` upsert
- history / material center 读取写入边界

## 6. 方案格式要求

方案至少包含：

1. 总体迁移原则。
2. 表清单。
3. 每张表的关键字段、主键、外键、索引。
4. Supabase-only 语义替代：
   - `auth.users`
   - RLS policy
   - `auth.uid()`
   - Supabase RPC
   - `supabase_storage`
5. migration 顺序。
6. seed / fixture 方案。
7. repository 迁移顺序。
8. self-hosted smoke 验证清单。
9. 阿里云 RDS PostgreSQL 兼容风险，尤其是 pgvector。
10. 不做项和后置项。

## 7. 不要做的事

本轮不要：

- 写业务代码大改。
- 修改远端新加坡服务。
- merge main。
- 写 `DOMESTIC_PHASE1_E2E_PASS`。
- 标记 long-task complete。
- 切 `ba-ba-ke.com`。
- 声称咨询 / 知识库 / Agent 已完成迁移。
- 实现 Aliyun OSS adapter。

## 8. 完成后的交付

提交一个 docs commit 即可。

最终回复需要包含：

- 新增方案路径。
- 关键迁移结论。
- 推荐下一轮第一批代码迁移范围。
- 是否需要先确认阿里云 RDS pgvector 支持。
- push / merge 状态。

建议下一轮代码迁移优先级：

```text
1. platform_admin_users / platform_admin_sessions
2. consultation_sessions / messages / events
3. merchant_strategy_assets
4. knowledge_documents / chunks / ingestion_jobs
5. pgvector / match_knowledge_chunks replacement
```

