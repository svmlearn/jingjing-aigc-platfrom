# 2026-04-23 平台管理台邀请码剩余覆盖项实现与验证

## 本轮目标

把此前在测试文档中标记为“未覆盖 / 未实现”的三项补齐到真实可验证状态：

1. 商家侧真实邀请码兑换链路
2. 邀请码停用 / 启用动作
3. 邀请码列表搜索 / 筛选

## 实现内容

### 1. 商家侧注册页接真实邀请码链路

- 文件：
  - `app/src/components/dashboard/registration-flow.tsx`
- 改动：
  - 注册页不再使用前缀判断的 mock 成功逻辑
  - 改为真实调用 `/api/auth/register-with-invite`
  - 增加 `merchantName` 字段
  - 根据后端错误码返回明确提示
  - 注册成功后跳转 `/merchant/onboarding`

### 2. 商户资料表单改为真实读写

- 文件：
  - `app/src/components/dashboard/merchant-profile-form.tsx`
  - `app/src/app/dashboard/merchant-profile/page.tsx`
- 改动：
  - 表单初始化改为读取 `/api/merchant-profile`
  - 保存改为 PATCH `/api/merchant-profile`
  - 服务项目改为按换行写入 `serviceItems`

### 3. 平台管理台邀请码停用 / 启用

- 文件：
  - `app/src/lib/db/platform-admin-repository.ts`
  - `app/src/server/api/schemas.ts`
  - `app/src/app/api/platform-admin/invitation-codes/[invitationCodeId]/route.ts`
  - `app/src/components/platform-admin/invitation-code-status-action.tsx`
- 改动：
  - 新增邀请码状态更新方法
  - 限制可执行的状态切换
  - 新增后台 PATCH API
  - 列表页新增行内 `停用 / 重新启用`

### 4. 平台管理台邀请码搜索 / 筛选

- 文件：
  - `app/src/contracts/platform-admin.ts`
  - `app/src/app/api/platform-admin/invitation-codes/route.ts`
  - `app/src/app/platform-admin/invitation-codes/page.tsx`
  - `app/src/components/platform-admin/platform-admin-content.tsx`
  - `app/src/lib/db/platform-admin-repository.ts`
- 改动：
  - 新增 `q / status / usage` 三类过滤参数
  - 支持：
    - `active`
    - `disabled`
    - `redeemed`
    - `expired`
    - `unused`
    - `expiring`
  - 列表页新增搜索表单、状态筛选、使用情况筛选与清空筛选

### 5. 清理阻塞编译的重复页面文件

- 文件：
  - `app/src/app/platform-admin/invitation-codes/page 2.tsx`
- 处理：
  - 删除误入仓库的重复页面文件
  - 该文件会被 Next 当成路由页面参与编译，之前会直接卡住 `build`

## 验证结果

### 本地验证

- 目录：`app/`
- 命令：
  - `CI=1 pnpm build`
- 结果：
  - 通过

### Staging 部署

- 环境别名：
  - `https://jingjing-content-platform-staging.vercel.app`
- 本轮部署：
  - `https://jingjing-content-platform-staging-dt665zmjm.vercel.app`
- 结果：
  - 部署成功

### 浏览器点击验证

- 测试方式：
  - `web-access` 浏览器 CDP 点击测试
- 结果摘要：
  1. 无效邀请码注册被真实拦截
  2. 已停用邀请码注册被真实拦截
  3. 有效邀请码注册成功，并进入 `/merchant/onboarding`
  4. 后台可将邀请码从 `active` 停用为 `disabled`
  5. 搜索可按备注命中单条邀请码
  6. `已停用 / 已用完 / 即将过期 / 仅看未使用` 均返回正确子集

详细测试事实见：

- `docs/test/2026-04-23-platform-admin-invitation-code-click-test.md`

## 本轮新增测试数据

- `CLKTDIS0423111724`
- `CLKTEXP0423111724`
- `CLKTREG0423111724`
- `click-invalid-0423111724@example.com`
- `click-disabled-0423111724@example.com`
- `click-success-0423111724@example.com`

## 数据库说明

- 本轮没有新增 Supabase migration
- 本轮变更仅涉及应用代码和 staging 测试数据
