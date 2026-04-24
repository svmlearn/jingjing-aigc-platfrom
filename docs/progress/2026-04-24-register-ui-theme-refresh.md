# 2026-04-24 Register UI Theme Refresh

## 背景

用户在 staging `/register` 标注反馈：

- 注册主页浅蓝/蓝白风格与当前静境后台黑金主题不一致。
- 页面上的“返回后台”和说明/步骤区不应存在。

## 已完成

- 移除 `/register` 页面左侧说明区、步骤卡片和“返回后台”入口。
- 将注册页外壳改为静境后台一致的黑金暗色背景。
- 将 `RegistrationFlow` 注册表单改为黑金卡片、暗色输入框、金色主按钮。
- 保留原有邀请码注册提交逻辑，没有改动接口行为。

## 变更文件

- `app/src/app/(auth)/register/page.tsx`
- `app/src/components/dashboard/registration-flow.tsx`

## 验证

- `pnpm lint`：通过。
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`：通过。
- `vercel deploy --prod --yes --force`：通过。

## 部署结果

- Staging alias: `https://jingjing-content-platform-staging.vercel.app`
- Deployment URL: `https://jingjing-content-platform-staging-jjrnt408w.vercel.app`
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/rwhAmSFpsV2H58X2AzYSgxb3XGHk`

## 浏览器检查

已在 in-app browser 打开：

- `https://jingjing-content-platform-staging.vercel.app/register`

检查结果：

- 不再包含 `返回后台`。
- 不再包含旧文案 `用邀请码开通商户内容工作台`。
- 不再包含步骤卡片 `邀请码校验 / 创建商户 / 进入资料页`。
- 页面正文保留 `Merchant Access / 邀请码注册 / 创建 owner 账号`。

## 备注

- 本次没有提交测试注册表单，也没有消耗当前干净邀请码。
- 当前可继续用已创建的干净一次性邀请码做从 0 到 1 注册测试；为避免把访问凭证写入文档，这里不落明文。
