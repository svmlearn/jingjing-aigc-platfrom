# 2026-05-14 Dify 主链路成员管理接手说明

## 当前目标

补齐完整主链路测试入口：

```text
owner 成员管理 / 邀请码生成
-> 成员接受邀请码加入团队
-> owner 用内容日历 + Dify 为成员生成一周内容
```

## 已完成内容

1. 已把完整主链路 E2E 测试计划写入：
   - `docs/progress/2026-05-14-dify-calendar-member-integration.md`
2. 已新增 owner 侧团队管理 API：
   - `GET /api/merchant-team`
   - `POST /api/merchant-team/invitation-codes`
3. 已新增商家端页面：
   - `/dashboard/team`
4. 已接入商家端导航：
   - “团队成员”
5. 已保留并复用成员端已有接受邀请码链路：
   - `POST /api/member/invitations/accept`
   - `/member/invite?code=...`
6. 已更新总架构流程进度图：
   - `docs/progress/总架构流程进度图.html`

## 改动文件

- `app/src/app/api/merchant-team/route.ts`
- `app/src/app/api/merchant-team/invitation-codes/route.ts`
- `app/src/app/dashboard/team/page.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/team-management-workspace.tsx`
- `app/src/contracts/merchant.ts`
- `app/src/lib/db/merchant-repository.ts`
- `app/src/server/api/schemas.ts`
- `docs/progress/2026-05-14-dify-calendar-member-integration.md`
- `docs/progress/总架构流程进度图.html`

## 本地验证

已通过：

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

本地 demo API 冒烟已通过：

1. `GET /api/merchant-team`
   - 返回 owner workspace。
2. `POST /api/merchant-team/invitation-codes`
   - 创建 `TEAM-TEST-01` 成功。
3. `POST /api/member/invitations/accept`
   - 使用 `x-jingjing-demo-user-id: demo-member-001` 模拟成员加入成功。
4. 再次 `GET /api/merchant-team`
   - members 变为 owner + member。
   - `TEAM-TEST-01.redemptionCount = 1`。

补充说明：

- Codex in-app browser 自动化连接超时，未完成浏览器截图验证。
- 已用 dev server 页面 route、API 冒烟和 production build 覆盖主要风险。

## 当前 branch / worktree

worktree：

```text
/Users/wy/.codex/worktrees/dify-calendar-member-integration
```

branch：

```text
codex/dify-calendar-member-integration
```

最终 commit：

```text
以本轮最终回答中的 commit hash 为准。
```

## 下一步建议

1. 用真实 Supabase 登录 `ywangyangw1@163.com`，在 `/dashboard/team` 创建一次真实邀请码。
2. 准备 1 个真实成员账号接受邀请码。
3. 回到 owner 侧确认成员列表和 redemption count。
4. 再跑 `memberScope = active_members` 的一周 Dify batch。
5. 继续补视频素材上传到 AI 剪辑成片的真实 E2E。

## push / merge 状态

- 尚未 push。
- 尚未 merge。
- 当前分支待用户验收后再决定是否合入主线。
