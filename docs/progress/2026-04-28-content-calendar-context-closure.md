# 2026-04-28 内容日历上下文闭环修复

## 背景

在 `codex/integrate-m-video-work` 代码语义验收中发现：咨询页内容日历入口已经生成 `source=consultation_calendar`、`calendarItemId`、`strategyTag`，但图文 / 视频工作台页面和生成 API 没有完整接住这些参数，导致生成后的 draft 不能稳定追溯“用户当时点击的是哪一张内容日历卡片”。

W 确认产品规则：

- `source` 使用三类：
  - `consultation_calendar`：从咨询页内容日历进入
  - `material_center`：从素材中心进入
  - `manual`：用户直接打开工作台
- 新链路统一使用 `strategyTag`，旧 `strategy` 参数只做兼容读取。
- 内容日历上下文缺口本轮直接补齐，不作为待办遗留。

## 本轮完成

1. 图文工作台页面和视频工作台页面接收：
   - `source`
   - `calendarItemId`
   - `strategyTag`
   - 并兼容旧参数 `strategy`
2. 图文工作台和视频工作台在生成请求中向 API 传递：
   - `source`
   - `calendarItemId`
   - `strategyTag`
3. 内容中心送入工作台时补充：
   - `source=material_center`
   - 图文入口补充 `mode=rewrite`
4. 服务端生成图文 / 视频脚本时会解析生成上下文：
   - 如果 `source=consultation_calendar`，必须携带 `calendarItemId`
   - `calendarItemId` 必须能在当前 consultation session 的 `strategySnapshot.contentCalendarDraft` 中找到
   - 日历卡片类型必须和当前工作台匹配，图文卡片不能进入视频工作台生成，视频卡片不能进入图文工作台生成
5. `content_drafts.input_snapshot` 现在会写入：
   - `source`
   - `consultationSessionId`
   - `calendarItemId`
   - `selectedCalendarItem`
   - `strategyTag`
   - `strategySnapshot`
   - `merchantProfile`
   - `generationMode`（图文）
   - `materialContext`
6. `source_items.trace_payload` 也补充：
   - `generation_source`
   - `calendar_item_id`
   - `selected_calendar_item`
7. 视频脚本上下文 `scriptContext.contextDigest.selectedCalendarItem` 现在能带入真实视频日历卡片，而不是固定空值。
8. 顺手修复语义验收中的 P3：production revision 分流前先校验当前用户是否有权限访问对应 `contentVariantId`。

## selectedCalendarItem 中文解释

`calendarItemId` 是“用户点的那张内容日历卡片的唯一编号”。

`selectedCalendarItem` 是“那张卡片当时的快照”，当前最低包含：

- `id`：卡片编号
- `dayLabel`：日历里显示的日期标签，例如周三
- `contentType`：内容类型，图文或视频
- `strategyTag`：这条内容对应的策略标签
- `title`：卡片标题
- `summary`：卡片摘要
- `targetPlatform`：目标平台，图文默认为小红书，视频默认为抖音
- `contentGoal`：内容目标，当前数据结构暂时没有稳定字段，先写 `null`

## 验证结果

在 `app/` 执行：

```bash
pnpm lint
pnpm typecheck
pnpm build
node --test src/server/api/video-job-payload.test.ts src/server/api/video-growth-context.test.ts src/server/api/video-script-production-agent.test.ts src/server/api/video-chain-test-draft.test.ts
```

结果：

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm build`：通过，Next.js 生成 46 个 app routes
- `node --test ...`：22 passed

在 `workers/video-worker/` 执行：

```bash
PYTHONPATH=. pytest -q
```

结果：

- `46 passed`

## 当前状态

内容日历上下文缺口已在集成分支补齐。下一步可以继续做 staging 冒烟验收，重点看：

1. 咨询页点击图文日历卡片进入图文工作台，生成后 draft 的 `input_snapshot.selectedCalendarItem` 是否正确。
2. 咨询页点击视频日历卡片进入视频工作台，生成后 draft 的 `input_snapshot.selectedCalendarItem` 是否正确。
3. 错误 URL（比如视频工作台带了图文 `calendarItemId`）是否被服务端拒绝。
