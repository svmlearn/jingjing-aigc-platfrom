# 2026-04-23 平台管理台邀请码覆盖补齐 handoff

## 当前目标

补齐此前点击测试里仍未落地的 3 项：

1. 商家侧真实邀请码兑换链路
2. 邀请码停用 / 启用动作
3. 邀请码列表搜索 / 筛选

## 已完成内容

- 商家注册页已接真实 `/api/auth/register-with-invite`
- 商户资料补全页已接真实 `/api/merchant-profile`
- 平台管理台邀请码列表已支持：
  - 搜索
  - `已停用`
  - `已用完`
  - `即将过期`
  - `仅看未使用`
- 平台管理台邀请码列表已支持行内 `停用 / 重新启用`
- 删除了会阻塞 Next 构建的重复页面文件：
  - `app/src/app/platform-admin/invitation-codes/page 2.tsx`

## 关键验证

- 本地：`CI=1 pnpm build` 通过
- staging：已部署到
  - `https://jingjing-content-platform-staging.vercel.app`
- 浏览器点击验证已完成：
  - 无效邀请码注册失败
  - 停用邀请码注册失败
  - 有效邀请码注册成功并进入 `/merchant/onboarding`
  - 后台停用动作成功
  - 搜索 / 筛选结果正确

## 留痕文档

- 测试文档：
  - `docs/test/2026-04-23-platform-admin-invitation-code-click-test.md`
- 实现与验证：
  - `docs/progress/2026-04-23-platform-admin-remaining-coverage-implementation.md`

## 改动文件

- `app/src/app/api/platform-admin/invitation-codes/route.ts`
- `app/src/app/api/platform-admin/invitation-codes/[invitationCodeId]/route.ts`
- `app/src/app/dashboard/merchant-profile/page.tsx`
- `app/src/app/platform-admin/invitation-codes/page.tsx`
- `app/src/components/dashboard/merchant-profile-form.tsx`
- `app/src/components/dashboard/registration-flow.tsx`
- `app/src/components/platform-admin/invitation-code-status-action.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/contracts/platform-admin.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/schemas.ts`
- `docs/test/2026-04-23-platform-admin-invitation-code-click-test.md`
- `docs/progress/2026-04-23-platform-admin-remaining-coverage-implementation.md`

## 下一步建议

1. 如需环境整洁，可清理本轮 staging 测试数据
2. 如确认无误，可继续 push 或重新部署到目标环境
3. 如下一轮要继续邀请码能力，可补：
   - 删除邀请码
   - 批量生成
   - 更细粒度的操作日志筛选

## 提交状态

- 当前轮次改动已准备提交
- 本地仓库仍存在与本轮无关的其他未跟踪文件，提交时不应一并带入
