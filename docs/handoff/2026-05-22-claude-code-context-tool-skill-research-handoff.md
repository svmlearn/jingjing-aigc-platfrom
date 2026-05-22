# 2026-05-22 Claude Code 上下文 / 工具 / Skill 机制调研 Handoff

## 当前目标

产出一份面向后续执行 AI 的架构调研文档，把 Claude Code 参考仓库中的多轮消息、上下文注入、工具边界、Skill 激活机制转成当前咨询 Agent 的可执行改造指引。

## 已完成内容

- 调研 `references/open-source/claude-code项目/claude-code-main` 中以下关键文件：
  - `src/QueryEngine.ts`
  - `src/query.ts`
  - `src/context.ts`
  - `src/utils/api.ts`
  - `docs/extensibility/skills.mdx`
  - `docs/conversation/multi-turn.mdx`
  - `docs/conversation/the-loop.mdx`
  - `docs/context/project-memory.mdx`
- 对照当前项目以下文件：
  - `app/src/contracts/knowledge.ts`
  - `app/src/server/api/consultation-runtime/tools.ts`
  - `app/src/server/api/consultation-runtime/planner.ts`
  - `app/src/server/api/consultation-runtime/skills.ts`
  - `app/src/server/api/consultation-runtime/context.ts`
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/platform-admin-repository.ts`
  - `app/src/components/platform-admin/platform-settings-editor.tsx`
  - `app/src/server/api/schemas.ts`
- 新增架构调研与改造指引：
  - `docs/架构规范/2026-05-22-Claude-Code上下文工具Skill机制调研与咨询Agent改造指引.md`
- 新增本 progress：
  - `docs/progress/2026-05-22-claude-code-context-tool-skill-research.md`

## 重要结论

- `read_merchant_profile` 和 `read_history` 是伪工具，应从 LLM 可见工具、planner、平台设置 UI、默认 settings 中移除，改成 runtime 自动上下文。
- 当前单个 user JSON 应改为 runtime context message + 独立真实 user message。
- Skill 正文不应继续由启发式 active skill 自动塞入 system prompt，应改为显式激活或 attachment/tool result。
- strict 工具参数校验应保留；不要用 `.strip()` 让错误调用静默成功。
- 工具描述只写允许字段，不写“不要输出某字段”的负面字段列表。

## 改动文件

- `docs/架构规范/2026-05-22-Claude-Code上下文工具Skill机制调研与咨询Agent改造指引.md`
- `docs/progress/2026-05-22-claude-code-context-tool-skill-research.md`
- `docs/handoff/2026-05-22-claude-code-context-tool-skill-research-handoff.md`

## 验证结果

本轮是文档调研任务，没有改运行时代码。

已做：

- 源码与文档行号抽样复核。
- 文档结构抽样自检。

未做：

- 未运行 `node --test` / `pnpm typecheck` / `pnpm lint`，因为本轮没有运行时代码改动。

## 下一步建议

1. 用户先验收调研文档是否符合“后续 AI 能无脑执行”的粒度。
2. 验收后再开单独实现任务，按文档第 9 节推荐顺序改造。
3. 实现任务应继续在独立 worktree 中完成，并新增测试先锁住伪工具不可见、上下文自动注入、Skill 正文不进 system prompt。

## 分支与合并状态

- Branch：`codex/agent-tool-schema-fix`
- Worktree：`../jingjing-agent-tool-schema-fix`
- Final commit：以交付时 `codex/agent-tool-schema-fix` 分支 HEAD 为准
- Push：未 push
- Merge：未 merge
