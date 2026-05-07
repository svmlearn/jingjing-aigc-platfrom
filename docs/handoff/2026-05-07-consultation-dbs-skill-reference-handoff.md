# 咨询 Agent DBS Skill Reference 改造交接

日期：2026-05-07
分支：`codex/consultation-dbs-skill-reference`
Worktree：`/Users/wy/.codex/worktrees/consultation-dbs-skill-reference`
基线：`origin/main` `1804d1c docs: update native tool loop deployment record`

## 目标

从已调研的 DBS skill 体系中，给咨询 Agent 接入第一批诊断型 skill，并让平台 skill 支持 `metadata.references`，用于把 skill 和知识库 reference 建立可检索关联。

## 已完成

1. 新增讨论稿：
   - `docs/探索/2026-05-07-consultation-agent-dbs-skill-reference-plan.md`
2. Runtime 支持 `metadata.references`：
   - `AgentSkillReferenceDto`
   - `ConsultationRuntimeSkill.references`
   - active skill reference prompt
   - planner hints
   - retrieval query hint
   - context budget bucket
3. Agent Console Skill 编辑页支持维护 `metadata.references` JSON array。
4. 新增 Supabase migration：
   - seed 4 个 P0 DBS skill
   - seed 4 个短 reference 知识文档
   - seed 4 个知识集
   - 绑定到默认咨询 Agent
5. 补充结构性测试断言。

## 首批 Seed Skill

1. `dbs_diagnosis`：DBS 商业诊断
2. `dbs_deconstruct`：DBS 概念拆解
3. `dbs_benchmark`：DBS 对标判断
4. `dbs_goal`：DBS 目标清晰化

## 关键实现文件

1. `app/src/contracts/agent-console.ts`
2. `app/src/server/api/consultation-runtime/types.ts`
3. `app/src/server/api/consultation-runtime/skills.ts`
4. `app/src/server/api/consultation-runtime/planner.ts`
5. `app/src/server/api/consultation-runtime/tools.ts`
6. `app/src/server/api/consultation-runtime/context.ts`
7. `app/src/server/api/consultation-service.ts`
8. `app/src/components/platform-admin/agent-console-pages.tsx`
9. `app/supabase/migrations/202605070001_consultation_dbs_skill_references.sql`

## 验证

在 worktree 的 `app/` 下完成：

```bash
npm run typecheck
npm run lint
node --test src/server/api/consultation-service.test.ts src/server/api/agent-console-admin.test.ts
git diff --check
```

结果：

1. Typecheck 通过。
2. Lint 通过。
3. Node targeted tests：39 passed。
4. `git diff --check` 无 whitespace 问题。

说明：worktree 初始没有 `node_modules`，已在本地创建 `app/node_modules` symlink 指向主目录已安装依赖；该路径未进入 git。

## 未完成 / 下一步

1. 尚未导入个人 IP 项目中的完整 DBS reference 长文档。
2. 当前 migration 只 seed 了短 reference 文档，足够跑通检索链路和首批能力，但不是完整知识库。
3. 后续可做一个导入工具，将本地 DBS `references/*.md` 清洗后写入平台 Knowledge Documents。
4. `dbs-slowisfast`、`dbs-action`、`dbs-chatroom` 尚未迁入；建议等 P0 验证后再继续。
5. `dbs-chatroom` 更适合和多角色语音 orchestrator 一起设计，不建议作为普通 skill 直接启用。

## Main 状态说明

开工时主目录 `main` 工作区不干净，本分支从已提交的 `origin/main` 新建 worktree，不继承主目录未提交改动，也未修改主目录已有脏文件。
