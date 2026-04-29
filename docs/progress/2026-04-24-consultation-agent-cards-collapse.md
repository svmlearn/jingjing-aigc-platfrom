# 2026-04-24 Consultation Agent Cards Collapse

## 背景

用户在 staging `/dashboard` 标注反馈：

- 咨询诊断页顶部 agent 执行卡片区域占用过多高度。
- 希望这部分支持上下收缩，不要默认挤占聊天消息空间。

## 已完成

- 将 agent 执行卡片区域改为可折叠面板。
- 默认显示一条紧凑摘要：
  - `Agent 执行过程`
  - 已执行工具数量
  - 前 3 个工具名称摘要
- 点击 `展开` 后展示完整工具卡片网格。
- 点击 `收起` 后恢复为紧凑摘要条。
- 保留原有 tool cards 数据展示逻辑，没有修改 consultation agent 接口或后端数据结构。

## 变更文件

- `app/src/components/merchant/consultation-workspace.tsx`

## 验证

- `pnpm lint`：通过。
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`：通过。
- `vercel deploy --prod --yes --force`：通过。
- 二次细节部署：收敛展开按钮焦点描边，避免出现浏览器原生白色 outline。

## 部署结果

- Staging alias: `https://jingjing-content-platform-staging.vercel.app`
- Deployment URL: `https://jingjing-content-platform-staging-pa4o90opj.vercel.app`
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/H2BxsdTxDtVsFi4d1PRUFvoP4PdM`

## 浏览器检查

已在 in-app browser 验证：

- `/dashboard` 默认只显示紧凑 `Agent 执行过程` 摘要栏。
- 点击 `展开` 后完整工具卡片可见。
- 展开后按钮变为 `收起`，可再次压缩。
