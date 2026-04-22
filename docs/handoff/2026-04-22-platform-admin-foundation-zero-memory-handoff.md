# 2026-04-22 Platform Admin Foundation Zero-Memory Handoff

## 1. 当前目标

把“商家工作台 / 平台管理台”从纯页面规划推进到：

1. 商家工作台动作语义更清楚
2. 平台管理台页面骨架已落地
3. 平台管理台后端第一刀已开工
4. 为下一轮“接真 API + 应用 migration + 正式验证”做好交接

当前仍处于：

- `代码已改`
- `未 commit`
- `未 push`
- `未 merge`

## 2. 当前分支 / 基线

- 当前分支：`main`
- 当前 HEAD：`23425231f68521bef98f18958165182f08d17023`
- 工作区非干净，包含本轮未提交改动

## 3. 本轮已完成

### 3.1 商家工作台 UI 调整

已修改：

- `app/src/components/dashboard/content-center.tsx`
- `app/src/components/app/dashboard-shell.tsx`

结果：

- 内容中心动作从单一“查看”拆成：
  - `预览`
  - `详情`
  - `改写`
- 右侧面板改成“内容预览抽屉”
- 工作台壳文案从“操作后台”收成“商家工作台”
- 工作台里新增“平台管理台”入口

### 3.2 平台管理台 UI 骨架

已新增页面路由：

- `app/src/app/platform-admin/layout.tsx`
- `app/src/app/platform-admin/page.tsx`
- `app/src/app/platform-admin/invitation-codes/page.tsx`
- `app/src/app/platform-admin/invitation-codes/new/page.tsx`
- `app/src/app/platform-admin/merchants/page.tsx`
- `app/src/app/platform-admin/merchants/[merchantId]/page.tsx`
- `app/src/app/platform-admin/settings/page.tsx`

已新增组件 / mock：

- `app/src/components/platform-admin/platform-admin-shell.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/lib/ui/platform-admin-mock.ts`

页面已覆盖：

- 总览
- 邀请码管理
- 新建邀请码
- 商户管理
- 商户详情
- 系统配置

### 3.3 平台管理台后端第一刀

已新增架构文档：

- `docs/架构规范/2026-04-22-platform-admin-backend-slice.md`

已新增 migration：

- `app/supabase/migrations/202604220001_v01_platform_admin_foundation.sql`

这版 migration 计划引入：

- `merchant_profiles.status` 支持 `disabled`
- `merchant_profiles.plan`
- `invitation_codes.note`
- `platform_settings`
- `platform_admin_events`

已新增 contract / repo / API：

- `app/src/contracts/platform-admin.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/app/api/platform-admin/invitation-codes/route.ts`
- `app/src/app/api/platform-admin/merchants/route.ts`
- `app/src/app/api/platform-admin/merchants/[merchantId]/route.ts`
- `app/src/app/api/platform-admin/settings/route.ts`

已更新：

- `app/src/contracts/merchant.ts`
- `app/src/lib/db/merchant-repository.ts`
- `app/src/server/api/errors.ts`
- `app/src/server/api/schemas.ts`
- `app/src/app/api/invitation-codes/route.ts`

### 3.4 商家工作台后端联动

已把“商户状态不可用时拦截”接入这些链路：

- `app/src/app/api/merchant-profile/route.ts`
- `app/src/app/api/source-items/route.ts`
- `app/src/app/api/source-items/[id]/route.ts`
- `app/src/app/api/source-items/[id]/comments/route.ts`
- `app/src/server/import-jobs/service.ts`

当前设计：

- `active`：允许继续
- `disabled`：403 `MERCHANT_DISABLED`
- `archived`：403 `MERCHANT_ARCHIVED`

## 4. 本轮文档留痕

已新增：

- `docs/探索/2026-04-22-工作台与平台管理台-页面二次收敛.md`
- `docs/progress/2026-04-22-platform-admin-ui-slice.md`
- `docs/progress/2026-04-22-platform-admin-backend-foundation.md`

设计产物：

- `docs/designs/2026-04-22-current-workbench-and-platform-admin.pen`
- `docs/designs/2026-04-22-current-workbench-and-platform-admin.png`
- `docs/designs/2026-04-22-current-workbench-and-platform-admin-v2.png`
- `docs/designs/exports/export.pdf`

注意：

- Pencil 第二版只成功导出了 `v2.png`
- 没有成功保存出对应可继续编辑的 `v2.pen`
- 原因是 Pencil CLI 在生成过程中撞到 `rate_limit`

## 5. 还没完成的关键步骤

### 5.1 必做：应用 migration

当前 migration 只是落在仓库里，还没有确认应用到 Supabase。

下一位需要：

1. 应用 `202604220001_v01_platform_admin_foundation.sql`
2. 确认表和字段已创建成功
3. 检查旧数据默认值是否合理

### 5.2 必做：把平台管理台页面从 mock 切到真实 API

现在 `platform-admin` 页面 UI 仍主要读：

- `app/src/lib/ui/platform-admin-mock.ts`

下一位需要逐步切到：

- `/api/platform-admin/invitation-codes`
- `/api/platform-admin/merchants`
- `/api/platform-admin/merchants/:merchantId`
- `/api/platform-admin/settings`

### 5.3 必做：正式验证

本轮尝试过：

- `pnpm lint`
- `pnpm build`
- TypeScript 程序化检查

但当前本地环境存在“命令无报错输出但不稳定返回”的情况。

所以现阶段不能把本轮说成：

- lint 已通过
- build 已通过

下一位需要在更稳定环境里重新做正式验证。

## 6. 当前实现边界

已经有的：

- 平台管理 API 路由
- 平台配置表设计
- 商户禁用态拦截
- 邀请码备注
- 会员等级字段

还没有的：

- 平台管理员账号体系
- `platform_secrets`
- `OPENAI_API_KEY / APIFY_TOKEN` 数据库存储
- 真实积分流水 / 每日重置
- 单商户额度覆写
- 总览指标真实计算
- 系统告警事实源

## 7. 推荐下一步顺序

建议严格按这个顺序继续：

1. 应用 migration 到 staging Supabase
2. 直接调用新 platform-admin API 做最小联调
3. 把前端 `platform-admin` 页面从 mock 切到 API
4. 再做 lint / build / 路由访问验证
5. 最后再考虑 commit

## 8. 当前未提交改动范围

大致包括：

- `app/src/app/api/platform-admin/**`
- `app/src/app/platform-admin/**`
- `app/src/components/platform-admin/**`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/contracts/platform-admin.ts`
- `app/supabase/migrations/202604220001_v01_platform_admin_foundation.sql`
- 商家工作台若干联动文件
- 本轮 docs / designs

请不要误以为这些已经提交或已经部署。

## 9. Push / Merge 状态

- 未 commit
- 未 push
- 未 merge

