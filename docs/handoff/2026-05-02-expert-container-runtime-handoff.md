# 2026-05-02 专家容器 Runtime 改造 Handoff

## 当前目标

把咨询平台从“三专家固定状态机”的方向，推进到“统一 consultation runtime + 上下文工程注入器 + 可插拔专家容器”的底座。

## 已完成内容

- 普通咨询消息支持开头 `@专家名` / `@agentKey` 路由到后台 enabled `AgentConfig`。
- 目标专家容器会加载：
  - active system prompt
  - enabled skill bindings
  - enabled knowledge set bindings
  - `modelConfig` 里的工具和模型配置覆盖
- 新增 `consultation_context_injector_v1`，把共享咨询上下文注入模型和策略资产编辑器。
- 知识库检索支持按专家绑定的 `knowledgeDocumentIds` 收窄平台知识范围，同时保留商家私有 indexed 知识。
- 圆桌原三专家已包装为 `RoundtableExpertContainer`，现有固定阶段流程保持兼容。
- 补充源代码级回归测试，覆盖 `@` 路由、专家容器、上下文注入、知识/工具边界。
- 前台普通咨询输入区已展示可 `@` 专家 roster：
  - 新增 `GET /api/consultation/experts`。
  - 普通咨询模式下显示专家 chip，点击会把 `@专家名 ` 插入输入框开头。
  - 如果输入框已有其它 `@xxx`，点击新专家会替换开头 mention 并保留正文。
  - assistant 消息会显示实际命中的专家容器名称。
- 圆桌咨询 Beta 已从前台主入口移除：
  - 不再展示“咨询模式”切换条。
  - 不再展示圆桌进度面板、阶段完成按钮、圆桌阶段产物面板。
  - 后端 roundtable 服务暂时保留为 legacy 兼容层，旧圆桌会话只显示提示，建议新开普通咨询后用 `@专家` 继续。

## 改动文件

- `app/src/server/api/consultation-service.ts`
- `app/src/app/api/consultation/experts/route.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/contracts/consultation.ts`
- `app/src/lib/db/knowledge-repository.ts`
- `app/src/server/api/roundtable-consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-02-roundtable-multi-agent-implementation.md`

## 验证结果

已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint
git diff --check
```

测试结果：14 条通过。`node --test` 有既有 ESM warning，不影响结果。

## 后续建议

1. 后台 UI：在 Agent Console 增加“作为咨询专家可被 @”的显式开关，以及专家别名配置。
2. 数据模型：如果要替代圆桌固定阶段，新增 consultation room / membership / active responder metadata，比继续扩展 roundtable state 更稳。
3. 圆桌迁移：下一版可以把 `asset / skill / marketing` 三个内置容器 seed 成后台 AgentConfig，再让 roundtable 从配置读取默认专家链。
4. 观测：把 `mentionRouting` 和 `agentContainer` 做成后台测试运行或事件查看页里的可见字段，便于排查专家命中。
5. Legacy 清理：等确认没有旧圆桌会话依赖后，再删除 roundtable API/service/types/tests。

## Branch / Merge 状态

- Branch：`codex/v2.2-roundtable-multi-agent`
- Commit：未创建
- Push：未 push
- Merge：未 merge
- 状态：待用户验收 / 待决定是否继续补 UI 和数据模型
