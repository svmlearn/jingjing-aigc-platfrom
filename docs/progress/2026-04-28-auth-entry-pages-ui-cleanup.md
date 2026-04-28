# 2026-04-28 登录 / 注册 / 平台后台入口 UI 清理

## 背景

用户反馈：

- 商家登录页、商家注册页、平台后台登录页缺少页面内返回按钮，只能依赖浏览器回退。
- 首页已有身份入口，商家登录页底部也已有「使用邀请码注册」，不需要在首页额外突出「邀请码注册」入口。
- 平台后台登录页 UI 与商家端不统一，右侧「当前访问规则」属于内部说明，不应展示在入口页。

## 本次改动

- 新增 `app/src/components/app/auth-back-button.tsx`：
  - 左上角固定返回按钮。
  - 优先执行浏览器历史返回，若无历史则回到 fallback 地址。
- 修改 `app/src/app/(auth)/login/page.tsx`：
  - 增加左上返回按钮。
- 修改 `app/src/app/(auth)/register/page.tsx`：
  - 增加左上返回按钮，直接打开时 fallback 到 `/login`。
- 修改 `app/src/app/platform-admin-login/page.tsx`：
  - 改为深色单卡片风格，与商家登录页统一。
  - 删除右侧「当前访问规则」说明栏。
  - 保留必要的首次 super_admin 初始化逻辑，但不再展示大段访问规则。
- 修改 `app/src/app/page.tsx`：
  - 首页入口从「商家登录 / 邀请码注册 / 平台管理」收敛为「商家登录 / 平台管理」。
  - 商家注册入口只保留在商家登录页底部。

## 验证

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。
- 本地 `next start -p 3100` 后：
  - `/` 返回 `200`。
  - `/login` 返回 `200`。
  - `/register` 返回 `200`。

## 状态

- 待 commit / push / Vercel staging 部署。
- 本次无 Supabase migration。
