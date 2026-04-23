# 2026-04-22 Platform Admin Backend Slice

这份文档用于把“平台管理台后端第一刀”冻结成一版可执行范围，避免页面已经拆开，但后台数据模型还停留在商家工作台阶段。

## 1. 目标

本轮不是一次性做完整个平台管理后台，而是先把下面这 4 个后台基础补齐：

1. `平台管理接口入口`
   - 统一走内部 admin 鉴权
   - 先复用 `ADMIN_SETUP_SECRET`

2. `商户治理基础模型`
   - 商户状态支持 `disabled`
   - 商户支持会员等级 `free / plus / pro`

3. `平台配置持久化`
   - 平台导入默认值
   - 平台 LLM 运行参数
   - 会员积分规则

4. `平台操作留痕`
   - 生成邀请码
   - 修改商户状态/等级
   - 修改平台配置

## 2. 本轮明确不做

这些需求是重要的，但不放在第一刀里：

1. 真正的平台管理员账号体系
   - 暂不做单独 `platform_admin_users`
   - 暂不做 RBAC

2. 平台密钥安全存储
   - `OPENAI_API_KEY`
   - `APIFY_TOKEN`
   - 当前先继续由环境变量托管
   - 页面端只读掩码和配置结构，不在这轮写入数据库明文

3. 真实积分扣减与每日重置
   - 暂不做积分流水
   - 暂不做定时重置
   - 本轮只先做套餐默认值配置

4. 总览指标计算
   - “今日改写数”“失败率”这类指标当前没有统一事实源
   - 本轮不把总览数据做成真实 API

## 3. 数据模型

## 3.1 `merchant_profiles`

补两项字段：

- `status`
  - 从 `active / archived`
  - 扩成 `active / disabled / archived`

- `plan`
  - 新增会员等级
  - `free / plus / pro`

说明：

- `disabled` 表示平台临时停用商户
- 被停用商户不可继续使用导入、内容、改写等商家工作台 API
- `plan` 先只表达套餐，不直接承载积分流水

## 3.2 `invitation_codes`

补一项字段：

- `note`
  - 用于渠道标签 / 备注

## 3.3 `platform_settings`

新增平台配置表：

- `key`
- `category`
- `value`
- `description`
- `created_at`
- `updated_at`

第一版只存三类配置：

1. `llm_runtime`
2. `import_runtime`
3. `membership_plans`

其中：

- `llm_runtime` 先存非秘密运行参数
- API Key 仍由环境变量提供
- `membership_plans` 先存三档套餐默认积分

## 3.4 `platform_admin_events`

新增平台操作日志表：

- `actor_label`
- `event_type`
- `target_type`
- `target_id`
- `summary`
- `details`
- `created_at`

第一版只记录：

- 邀请码创建
- 商户状态/套餐修改
- 平台配置修改

## 4. 鉴权策略

本轮平台管理 API 统一使用：

- `x-admin-secret`
- 或 `Authorization: Bearer <ADMIN_SETUP_SECRET>`

原因：

1. 当前项目已经有这套内部保护方式
2. 先把平台管理域跑通，比一上来做完整管理员账号体系更稳
3. 未来可平滑升级为 `assertPlatformAdminAccess`

## 5. API 范围

本轮新增这组接口：

### 5.1 邀请码

- `GET /api/platform-admin/invitation-codes`
- `POST /api/platform-admin/invitation-codes`

### 5.2 商户

- `GET /api/platform-admin/merchants`
- `GET /api/platform-admin/merchants/:merchantId`
- `PATCH /api/platform-admin/merchants/:merchantId`

允许修改：

- `status`
- `plan`

### 5.3 平台配置

- `GET /api/platform-admin/settings`
- `PUT /api/platform-admin/settings`

允许修改：

- `llm_runtime`
- `import_runtime`
- `membership_plans`

## 6. 商家工作台联动

一旦商户状态不是 `active`，下列商家工作台接口应直接拦截：

- `/api/merchant-profile`
- `/api/import-jobs`
- `/api/import-jobs/:id`
- `/api/import-jobs/:id/run`
- `/api/source-items`
- `/api/source-items/:id`
- `/api/source-items/:id/comments`

返回：

- `403 MERCHANT_DISABLED`
  或
- `403 MERCHANT_ARCHIVED`

也就是说，这轮不只是给平台管理台补接口，还要让“禁用商户”真的对商家工作台生效。

## 7. 本轮落地顺序

1. migration
2. contract / schema
3. repository
4. platform-admin API routes
5. merchant active guard
6. progress 记录

## 8. 下一刀

本轮结束后，下一刀优先级建议是：

1. `platform_secrets`
   - 平台级密钥安全存储

2. `platform_admin_users`
   - 真正的平台管理员登录和权限模型

3. `merchant_credit_ledger`
   - 积分扣减、每日重置、单商户覆写

4. `platform_overview_metrics`
   - 统一的总览指标事实源

