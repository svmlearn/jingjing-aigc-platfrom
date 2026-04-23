# 2026-04-22 Platform Admin UI Slice

## 本轮目标

先把已经明确的页面结构补到代码里，让“商家工作台”和“平台管理台”在路由层、壳层和演示数据层分开。

## 已完成

### 1. 商家工作台

- 内容中心动作从原来的单一“查看”拆成：
  - `预览`
  - `详情`
  - `改写`
- 右侧抽屉文案改为“内容预览抽屉”
- 抽屉里新增进入独立详情页的快捷入口
- 工作台壳文案从“操作后台”改为“商家工作台”
- 工作台侧栏和移动端头部新增“平台管理台”演示入口

### 2. 平台管理台

新增独立路由域：

- `/platform-admin`
- `/platform-admin/invitation-codes`
- `/platform-admin/invitation-codes/new`
- `/platform-admin/merchants`
- `/platform-admin/merchants/[merchantId]`
- `/platform-admin/settings`

新增内容：

- 平台管理台独立壳与导航
- 总览页
  - 业务摘要卡片
  - 管理员操作日志
  - 系统告警
- 邀请码管理页
- 新建邀请码页
- 商户管理页
- 商户详情页
- 系统配置页
  - LLM Provider 配置
  - 导入默认值
  - 会员与积分规则

### 3. 演示数据

新增平台管理台 mock 数据：

- 管理员操作日志
- 系统告警
- 邀请码列表
- 商户列表
- 商户状态
- 会员等级与每日积分
- LLM Provider 配置
- 导入默认值

## 这轮仍然没做的

这些不是 UI 漏掉，而是后端和数据层还没正式落位：

1. 平台管理员鉴权
   - 当前 `platform-admin` 还是演示路由，没有独立 admin auth

2. 邀请码管理真实提交
   - 目前已有 `/api/invitation-codes`
   - 但新建邀请码页还没接真实提交链路
   - 也还没把结果写进操作日志

3. 商户启用 / 禁用 / 归档真实生效
   - 目前数据库里的 `merchant_profiles.status` 仍只有 `active / archived`
   - 如要支持 `disabled`，需要 migration + repository + API 一起补

4. 会员等级与积分
   - 当前只是管理台 mock
   - 还没有正式数据表、扣点规则、每日重置策略、商户级覆写能力

5. 平台级配置中心
   - 当前页面里已经展示 `Base URL / API Key / 模型 / timeout / retry`
   - 但真实配置仍主要依赖环境变量
   - 后续要补：
     - `platform_settings`
     - `platform_secrets`
     - 安全存储 / 掩码读取 / 审计日志

6. 管理员操作日志与系统告警
   - 现在是演示数据
   - 还没有统一事件模型和监控来源

## 验证说明

本轮主要完成了页面与 mock 数据层补全。

尝试执行过：

- `pnpm lint`
- `pnpm build`

但当前本地终端里这两个命令没有稳定返回可读结果，因此这次不能把 lint / build 说成已确认通过。

已通过文件级人工检查确认：

- 新增路由文件存在
- 主要组件结构和导入路径已对上
- 页面边界与 2026-04-22 的二次收敛文档保持一致

