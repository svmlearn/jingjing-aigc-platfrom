# 2026-04-23 platform-admin invitation-code flow fix handoff

## 当前目标

把平台管理台的邀请码创建页从静态展示改成真实可用流程，并修掉“字段突兀、切换无效、生成按钮无效”的问题。

## 已完成

1. 平台管理台 API 鉴权支持登录页 cookie session
2. 邀请码新建页改成真实可提交的客户端表单
3. 去掉单独填写“用途”的设计，改为固定说明“用于商户注册”
4. 手动模式下才显示“手动邀请码”
5. 邀请码列表页改为读取真实数据并支持创建成功提示
6. staging 已重新部署并完成一轮线上自测

## 本轮改动文件

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/server/api/errors.ts`
- `app/src/components/platform-admin/create-invitation-code-form.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/app/platform-admin/invitation-codes/page.tsx`
- `app/src/app/platform-admin-login/page.tsx`
- `docs/progress/2026-04-23-platform-admin-invitation-code-flow-fix.md`

## 线上验证事实

- staging alias:
  - `https://jingjing-content-platform-staging.vercel.app`
- deployment:
  - `https://jingjing-content-platform-staging-n2iqtrxer.vercel.app`
- 未登录访问 `/platform-admin` 会重定向到 `/platform-admin-login`
- 已登录 session 访问 `/platform-admin/invitation-codes/new`，页面字段已变为新的表单结构
- 已登录 session 成功创建真实邀请码：
  - `SELFTEST0423003017`
  - 备注：`系统自测-2026-04-23`
- 创建成功后列表页可回显该邀请码与提示文案

## 当前状态

- branch: `main`
- worktree: 当前主工作区
- commit: 无（本轮尚未提交）
- push: 否
- merge: 否

## 下一步建议

1. 让用户直接在 staging 上复看一遍新表单
2. 如果确认文案和交互没问题，提交 commit
3. 后续可继续补：
   - 邀请码停用/禁用动作
   - 列表筛选与搜索
   - 平台管理员正式账号体系替代共享口令
