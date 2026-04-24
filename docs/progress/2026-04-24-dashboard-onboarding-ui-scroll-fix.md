# 2026-04-24 Dashboard Scroll + Onboarding Theme Fix

## 背景

用户在 staging 标注反馈：

- `/dashboard` 咨询诊断页在小窗口下，底部消息内容被输入区遮挡或无法顺畅滚动查看。
- `/merchant/onboarding` 商户资料补全页仍是浅蓝旧 UI，与当前静境后台黑金主题不统一。

## 已完成

- 调整咨询诊断页滚动结构：
  - 将工具执行卡片与聊天消息合并到同一个可滚动内容区。
  - 保持底部输入框固定在咨询卡片底部。
  - 右侧策略资产栏增加独立纵向滚动能力。
- 调整商户资料补全页视觉：
  - 页面背景改为黑金沉浸式背景。
  - 表单卡片、输入框、textarea、按钮、加载态、错误态、成功态统一为黑金主题。
  - 保留原有商户资料读取、保存、跳转逻辑。

## 变更文件

- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/app/(auth)/merchant/onboarding/page.tsx`
- `app/src/components/dashboard/merchant-profile-form.tsx`

## 验证

- `pnpm lint`：通过。
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`：通过。
- `vercel deploy --prod --yes --force`：通过。

## 部署结果

- Staging alias: `https://jingjing-content-platform-staging.vercel.app`
- Deployment URL: `https://jingjing-content-platform-staging-2g5cend80.vercel.app`
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/DLWxcMDBfYpbMFRdRB8aeTKx2xDq`

## 浏览器检查

已在 in-app browser 验证：

- `/dashboard`：在小窗口下滚轮可将咨询历史消息滚出并完整查看，输入区保持固定。
- `/merchant/onboarding`：页面已切换为黑金主题，小窗口可继续向下滚到保存按钮。

## 备注

- 本次没有提交商户资料表单，没有触发数据写入。
- 本次没有修改咨询 agent 接口或消息生成逻辑，仅修正布局与样式。
