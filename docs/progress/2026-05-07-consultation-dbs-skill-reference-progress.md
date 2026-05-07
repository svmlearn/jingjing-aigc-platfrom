# 咨询 Agent DBS Skill Reference 改造执行记录

日期：2026-05-07
分支：`codex/consultation-dbs-skill-reference`

## 执行内容

1. 确认主目录当前在 `main`，但工作区有未提交改动。
2. 从 `origin/main` 新建独立 worktree：
   - `/Users/wy/.codex/worktrees/consultation-dbs-skill-reference`
3. 将 DBS skill/reference 讨论稿带入新分支。
4. 实现 `metadata.references` 的 runtime 支持：
   - 解析 skill metadata
   - 注入 active skill reference prompt
   - 给 planner 提供 active skill reference hints
   - 将 reference title 加入知识库检索 query hint
   - 在 skill disclosure 和 context budget 中记录 reference 信息
5. 在 Agent Console Skill 编辑页新增 References JSON 编辑区。
6. 新增 migration seed 首批 P0 DBS skill 和短 reference 知识包。
7. 补充测试断言。

## 验证记录

```bash
npm run typecheck
```

结果：通过。

```bash
npm run lint
```

结果：通过。

```bash
node --test src/server/api/consultation-service.test.ts src/server/api/agent-console-admin.test.ts
```

结果：39 passed。

```bash
git diff --check
```

结果：通过，无 whitespace 问题。

## 重要判断

1. 不新增数据库列，先复用 `agent_skills.metadata.references`。
2. 不把 reference 全文直接塞进 skill body，而是通过知识库检索。
3. 首批只迁入咨询诊断型 skill，不迁入标题、hook、内容生产类 skill。
4. Seed 的 reference 文档是短版，用于跑通链路；完整 DBS reference 需要后续清洗导入。

## 当前状态

代码完成，验证通过，待用户验收后决定是否合并 / 推送 / 部署。
