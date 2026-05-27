# 2026-05-27 咨询 Agent 工具清单问题排查与修复

## 背景

用户反馈 `shaokao@163.com` 在咨询台追问“你能用什么工具”时，Agent 回复跑偏：

- 先回答内容日历 schema 问题，把 `图文 / 视频` 改成 `article / video`，没有直接回答工具清单。
- 后续列工具时，把“视频素材库搜索”解释成“园区场景 / 产品操作类视频”，把“爆款内容检索”解释成“夜宵场景 / 工友社交类短视频参考模板”。

用户怀疑当前账号是烧烤商家，不应该出现园区、产品操作、固定模板等不准确描述，要求查看运行日志。

## 线上日志事实

服务器：`ubuntu@8.154.28.41`

实际命中的咨询 session：

- session id：`f3c0a9b7-11e1-4499-b9fe-985c63ab49a8`
- merchant：`烧烤商家`
- merchant id：`a8df8d8a-38f2-49b0-bda7-40c48d3537cf`
- owner email：`shaokao@163.com`

按 `created_by_user_id = shaokao@163.com` 查 2026-05-27 13:00-15:00 CST 没有命中新会话；按 merchant 查全天，命中了截图里的旧 session。相关消息实际发生在日志显示的 `2026-05-27 05:44-05:48 CST` 左右。

关键消息：

1. 用户：`你现在能用什么工具了`
2. Agent 实际调用了 `search_saved_viral_materials`，参数 `{}`。
3. runtime 补齐后的 query 是：`你现在能用什么工具了 餐饮`。
4. 工具结果：`本地爆款库命中 54 条 ready 爆款内容，返回 8 条紧凑参考。`
5. Agent 回复却转向内容日历 schema：`当前工具限制要求将「图文」改为「article」...`
6. 用户追问：`我是问，你能用什么工具`
7. 第二轮没有任何 tool result，Agent 自然语言列了工具，但把工具描述和旧会话上下文混在一起。

## 根因判断

### 1. 工具清单类问题被误送进工具循环

`你现在能用什么工具了` 是元问题，本应直接回答当前启用的工具清单。

但当时 runtime 没有识别这种 intent，仍交给模型 JSON tool loop。模型选择了 `search_saved_viral_materials`，而该工具参数为空时会自动补 query，最终变成 `你现在能用什么工具了 餐饮`，命中了本地爆款库。

这不是账号串库。工具是按当前 merchant id 调用的：

```ts
listMaterialLibraryItems({
  merchantId: state.merchant.id,
  limit: 160,
  query: query || null,
})
```

问题是这个 query 太泛，且本轮根本不该触发素材检索。

### 2. 第二轮没有真实工具结果，但模型沿用了旧 expertTurnNotes

第二轮 `我是问，你能用什么工具` 的 `agent.loop.completed` 显示：

- `completedTools`: `[]`
- `failedTools`: `[]`
- `skippedTools`: `[]`
- `toolResults`: `[]`
- `selectedContextPack`: `light_chat`

但 context 里仍包含前几轮 `expertTurnNotes`，里面有“园区工友 / 独家腌料 / 15分钟夜宵战 / 408厂”等旧会话内容。模型在列工具时把这些场景词掺进工具说明，造成“工具能力”和“已确认业务场景 / 已命中参考内容”混淆。

### 3. “园区工友”等不是另一个账号的数据

这些词来自同一个烧烤 session 里用户之前提供的事实：

- 在工业园区。
- 常来的是工厂工人。
- 下班后吃烧烤、喝啤酒、和同事聊天。
- 独家腌料。

其中 `408厂` 不是用户确认事实，是模型在旧回复里自行举的例子，后续又被 expertTurnNotes 带入。这一部分应继续视为不可靠旧上下文，不应作为工具描述或已检索事实。

## 修复

新增 deterministic 工具清单分支：

- 当用户问题命中“能用什么工具 / 有哪些工具 / 列出工具 / 工具清单”等 intent 时，runtime 直接返回当前启用且 LLM 可见的工具目录。
- 不进入 native tool calling / JSON tool loop。
- 不调用 `search_project_video_materials`、`search_saved_viral_materials`、`update_content_calendar` 等业务工具。
- 回复明确说明：这是能力清单，不代表已经调用过；只有出现真实 tool result 时才说已检索或已更新。

改动文件：

- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-service.test.ts`

## 验证

已执行：

```bash
git diff --check
cd app
node --test src/lib/material-retrieval.test.ts src/server/api/consultation-service.test.ts
npm run typecheck
```

结果：

- `git diff --check`：通过。
- focused tests：`66` passed。
- `npm run typecheck`：通过。

## 未覆盖与后续建议

- 本轮先修“工具清单元问题误触发业务工具”的直接问题。
- 旧 session 里已经写入的 expertTurnNotes 仍保留历史内容，不做数据清洗。
- 后续如果继续发现模型把旧 expertTurnNotes 当事实，应单独收紧 short-term expert traffic：例如在 `light_chat` 或工具清单场景下不注入旧 handoff 文案，只保留工具结果摘要和当前策略资产事实。
