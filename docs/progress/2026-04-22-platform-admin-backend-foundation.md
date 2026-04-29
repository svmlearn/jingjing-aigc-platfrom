# 2026-04-22 Platform Admin Backend Foundation

## 本轮目标

根据 `2026-04-22-platform-admin-backend-slice.md`，先把平台管理台后端第一刀落下去：

- 平台管理 API 入口
- 商户 `disabled` 状态
- 商户 `plan`
- 邀请码备注
- 平台配置表
- 平台操作日志表

## 已完成

### 1. 架构文档

新增：

- `docs/架构规范/2026-04-22-platform-admin-backend-slice.md`

用于冻结这轮后端范围与非目标。

### 2. 数据库 migration

新增：

- `app/supabase/migrations/202604220001_v01_platform_admin_foundation.sql`

内容包括：

- `merchant_profiles.status` 支持 `disabled`
- `merchant_profiles.plan`
- `invitation_codes.note`
- `platform_settings`
- `platform_admin_events`
- 默认配置初始化

### 3. contract / schema

新增：

- `app/src/contracts/platform-admin.ts`

更新：

- `app/src/contracts/merchant.ts`
- `app/src/server/api/schemas.ts`

补齐了：

- 商户套餐类型
- 商户 `disabled`
- 邀请码 `note`
- 平台管理 merchant patch schema
- 平台 settings update schema

### 4. repository

新增：

- `app/src/lib/db/platform-admin-repository.ts`

当前已支持：

- 列出邀请码
- 创建邀请码（带 note）
- 列出商户
- 获取单商户详情
- 修改商户 `status / plan`
- 获取平台 settings
- 更新平台 settings
- 写入 `platform_admin_events`

### 5. API routes

新增：

- `GET/POST /api/platform-admin/invitation-codes`
- `GET /api/platform-admin/merchants`
- `GET/PATCH /api/platform-admin/merchants/:merchantId`
- `GET/PUT /api/platform-admin/settings`

### 6. 商家工作台联动

更新：

- `merchant-profile`
- `source-items`
- `source-item comments`
- `import-jobs service`

现在这些链路不再只拿商户 owner，而是要求商户状态可用：

- `active` 可继续使用
- `disabled` 返回 403
- `archived` 返回 403

## 当前仍未完成

### 1. 平台管理员账号体系

当前仍复用：

- `ADMIN_SETUP_SECRET`

还没有：

- `platform_admin_users`
- 真正登录态
- RBAC

### 2. 平台 secrets 安全存储

当前 `settings` 只管理非秘密参数。

还没有：

- `platform_secrets`
- `OPENAI_API_KEY / APIFY_TOKEN` 的数据库加密存储
- secret 轮换审计细节

### 3. 积分系统

当前只有：

- `merchant plan`
- `membership_plans` 默认值

还没有：

- 积分流水
- 扣点规则
- 每日重置
- 单商户额度覆写

### 4. 总览指标与告警事实源

当前还没有真实后台计算：

- 今日导入
- 今日改写
- 系统告警
- 失败率

## 验证说明

本轮做过的验证：

- 关键新增文件已落盘
- 路由目录已建立
- 变更点已人工核对

尝试执行：

- `pnpm lint`
- `pnpm build`
- TypeScript 程序化诊断

但当前本地环境在这些重命令上存在“无错误输出但不稳定返回”的情况，因此本轮**不能宣称 lint / build 已正式通过**。

换句话说：

- 这轮可以确认“结构已落地”
- 但还需要下一轮在更稳定的终端环境里做一次正式编译验证

