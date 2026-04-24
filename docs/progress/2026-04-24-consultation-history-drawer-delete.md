# 2026-04-24 Consultation History Drawer + Delete

## 背景

用户在 staging `/dashboard` 标注反馈：

- 顶部 `历史记录` 不应该跳转到 `我的内容` / `/dashboard/history`。
- 咨询聊天记录与图文、视频、草稿内容无关，应该直接在咨询诊断页展示。
- 聊天记录需要支持删除。

## 已完成

- 将咨询诊断页顶部 `历史记录` 从跳转链接改为右侧抽屉。
- 抽屉只展示 consultation sessions，不混入图文/视频内容。
- 点击抽屉内会话卡片可切换当前咨询会话。
- 抽屉打开时会主动刷新咨询会话列表。
- 增加加载态，避免会话列表尚未返回时误显示“没有记录”。
- 增加聊天记录删除能力：
  - 新增 `DELETE /api/consultation/sessions/[sessionId]`。
  - 删除会校验当前用户所属商户。
  - Supabase 下删除 `consultation_sessions`，消息与事件依赖外键 cascade 清理。
  - 本地 demo repository 也同步删除 session/messages/events。
  - 前端使用两步确认：`删除` -> `确认删除` -> 才真正执行删除。
- 修正当前 session 被删除后的选择逻辑，避免继续指向已不存在会话。

## 变更文件

- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/app/api/consultation/sessions/[sessionId]/route.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/lib/db/consultation-repository.ts`

## 验证

- `pnpm lint`：通过。
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`：通过。
- `vercel deploy --prod --yes --force`：通过。

## 部署结果

- Staging alias: `https://jingjing-content-platform-staging.vercel.app`
- Deployment URL: `https://jingjing-content-platform-staging-h791ncrll.vercel.app`
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/f2CkuSGxp98DpaM7MmMKeYmpXy2H`

## 浏览器检查

已在 in-app browser 验证：

- 点击 `/dashboard` 顶部 `历史记录` 后，仍停留在 `/dashboard`。
- 右侧出现 `咨询聊天记录` 抽屉。
- 抽屉内展示 consultation sessions。
- 点击第一次 `删除` 后变为 `确认删除`。

## 备注

- 本次浏览器验证没有点击第二次 `确认删除`，因此没有实际删除任何聊天记录。
