# 2026-04-24 Staging Authenticated Acceptance Progress

## 本轮目标

在三层部署完成后，继续推进 staging 验收：

- 商家端页面是否可打开
- 商家端 UI 是否接近 `docs/designs/AI设计的原型图/src/pages/`
- 平台管理台是否保护正确
- 找出继续跑完整闭环前还缺什么

## 已完成：非登录态路由 / UI 验收

验收地址：

- `https://jingjing-content-platform-staging.vercel.app`

浏览器验收结果：

- `/dashboard` 可打开，显示 `AI 咨询诊断`
- `/dashboard/article` 可打开，显示 `图文工作台`
- `/dashboard/video` 可打开，显示 `视频工作台`
- `/dashboard/content` 可打开，显示 `内容中心`
- `/dashboard/history` 可打开，显示 `我的内容`
- `/dashboard/settings` 可打开，显示 `商家设置`
- `/platform-admin/knowledge` 会被正确重定向到 `/platform-admin-login`
- `/platform-admin-login` 显示 `进入平台管理台` 与 `管理口令` 表单

接口保护结果：

- `POST /api/consultation/sessions` 返回 `401 UNAUTHENTICATED`
- `GET /api/merchant-profile` 返回 `401 UNAUTHENTICATED`
- `GET /api/platform-admin/settings` 返回 `401 UNAUTHORIZED`

## UI 与 AI 原型图对齐情况

已对照：

- `docs/designs/AI设计的原型图/src/pages/Consultation.tsx`
- `docs/designs/AI设计的原型图/src/pages/ArticleWorkbench.tsx`
- `docs/designs/AI设计的原型图/src/pages/VideoWorkbench.tsx`
- `docs/designs/AI设计的原型图/src/pages/ContentCenter.tsx`
- `docs/designs/AI设计的原型图/src/pages/History.tsx`
- `docs/designs/AI设计的原型图/src/pages/Settings.tsx`

已基本对齐：

- 暗色工作台视觉
- 琥珀色主操作按钮与状态标签
- 顶部胶囊导航
- 咨询 / 图文 / 视频 / 内容中心 / 我的内容 / 商家设置的信息架构
- 图文页左右分栏、策略输入、草稿预览空状态
- 视频页左右分栏、脚本协同、任务按钮空状态
- 内容中心 empty library 风格
- 历史页筛选结构

当前差距：

- 非登录状态下无法看到咨询完成后的右侧策略资产、内容日历、图文真实生成结果、视频脚本表格与任务状态。
- 当前 staging 页面在未登录时会在部分页面直接展示 `Please sign in first.`，还缺面向用户的登录引导或测试账号入口。
- `/dashboard` 咨询页未登录时没有明显错误条，但 `新开对话` 会停在 disabled 状态，容易让验收者误以为页面卡住。
- 平台管理台仍是浅色 admin 风格，不属于商家端 AI 原型图的暗色视觉体系；这是当前产品分层里的合理差异，但如果要统一品牌可后续单独设计。

## 当前阻塞

完整验收需要一个真实商家登录态，否则无法继续验证：

- 创建咨询会话
- 发送咨询消息
- agent loop 事件写入
- 生成图文草稿
- 生成视频脚本
- 创建视频任务
- 内容中心 / 历史页真实数据回显
- 商家设置保存

平台管理台完整验收还需要使用 `ADMIN_SETUP_SECRET` 登录，否则无法继续验证：

- `platform-admin/settings` 读取与保存
- `platform-admin/knowledge` 文档上传、入库、列表、重跑

## 下一步建议

需要用户明确授权后再继续执行以下会写入 staging 的操作：

1. 创建一个临时 staging 商家测试账号，或使用用户提供的现有测试账号登录。
2. 使用 `ADMIN_SETUP_SECRET` 登录平台管理台。
3. 写入少量测试数据，例如咨询消息、图文草稿、视频脚本、知识库 smoke 文档。
4. 验证完成后记录测试账号、测试数据 ID 和是否需要后续清理。

## 用户授权后续执行

用户已在本轮明确回复“授权”，允许继续执行会写入 staging 的验收动作：

- 创建临时 staging 商家测试账号
- 使用 `ADMIN_SETUP_SECRET` 登录平台管理台
- 写入少量测试数据
- 验证咨询、图文、视频、知识库与后台配置

本轮执行中没有打印或写入明文 `ADMIN_SETUP_SECRET`、测试账号密码、Supabase service role key。

## Authenticated smoke 实际结果

### 1. 临时商家账号与商户资料

创建邀请码：

- `JJ-SMOKE-20260424075628-305A30`

创建测试商家：

- 测试邮箱：`codex-smoke-jj-smoke-20260424075628-305a30@example.com`
- 商户名：`静境 Staging Smoke 8-305a30`
- Merchant ID：`ba54a996-1dd7-4468-9c54-54419f4fa5fc`
- 商户状态：`active`

补全资料结果：

- 联系电话：`000-0000-0424`
- 联系人：`Codex Smoke Tester`
- 地址：`Staging Smoke Test Address, Hangzhou`
- 服务项目：`普拉提私教 / 产后修复 / 体态评估 / 小班训练`
- 页面显示：`商户资料已保存到真实商户记录。`

### 2. 咨询 Agent Loop

咨询会话：

- Session ID：`d5057399-05c9-4aa1-9c9d-6d9d8254022f`
- 初始阶段：`商家画像读取`
- 后续阶段：`目标客群梳理`
- 知识库入库后阶段：`内容策略收束`

已验证：

- 咨询页可创建真实会话
- 用户消息可写入会话
- agent loop 工具卡可见
- `read_merchant_profile` 已执行
- `retrieve_knowledge_base` 已执行
- `update_strategy_snapshot` 已执行
- `update_content_calendar` 已执行
- `generate_article_brief` 已执行
- `generate_video_brief` 已执行
- `read_history` 已执行

知识库入库前：

- `检索平台知识库` 显示暂无 indexed 知识片段命中

知识库入库后：

- `检索平台知识库` 显示 `命中 1 个平台知识片段`
- assistant 回复明确引用 `Staging Smoke Knowledge 2026-04-24T08:02:27`

### 3. 图文工作台

访问：

- `/dashboard/article?sessionId=d5057399-05c9-4aa1-9c9d-6d9d8254022f`

结果：

- 真实读取咨询策略
- 点击 `生成草稿` 成功
- 页面显示 `已保存到记录`
- 生成两个标题方案
- 正文中包含测试商户、目标客群、服务卖点和 CTA
- 内容写入真实 `content_drafts / content_variants`

可见标题示例：

- `别再盲目发内容了，静境 Staging Smoke 8-305a30 先把这 3 个点讲清楚`
- `门店 3 公里内高意向到店人群 最在意的，其实不是价格`

### 4. 视频工作台与 worker

访问：

- `/dashboard/video?sessionId=d5057399-05c9-4aa1-9c9d-6d9d8254022f`

结果：

- 点击 `生成脚本` 成功
- 页面显示 `静境 Staging Smoke 8-305a30 门店场景视频脚本`
- 脚本保存到真实 `content_drafts / content_variants`
- 点击 `创建视频任务` 成功
- 页面初始显示 `pending · 等待调度`

worker 处理结果：

- Job ID：`c06eb471-d87f-4383-9cc8-db813338d317`
- Status：`succeeded`
- Current stage：`completed`
- Progress：`100`
- Failure：`null`
- Engine：`openstoryline-skeleton`
- Input asset count：`0`

输出对象：

- video：`video-outputs/ba54a996-1dd7-4468-9c54-54419f4fa5fc/29bc911d-ac2d-4a13-81b1-77a4d842a640/f2c50d4d-8f7f-432f-a99f-e10a31ac0657/c06eb471-d87f-4383-9cc8-db813338d317/final.mp4`
- cover：`video-covers/ba54a996-1dd7-4468-9c54-54419f4fa5fc/29bc911d-ac2d-4a13-81b1-77a4d842a640/f2c50d4d-8f7f-432f-a99f-e10a31ac0657/c06eb471-d87f-4383-9cc8-db813338d317/cover.jpg`
- subtitle：`video-subtitles/ba54a996-1dd7-4468-9c54-54419f4fa5fc/29bc911d-ac2d-4a13-81b1-77a4d842a640/f2c50d4d-8f7f-432f-a99f-e10a31ac0657/c06eb471-d87f-4383-9cc8-db813338d317/subtitles.srt`

### 5. 内容中心 / 历史页回显

内容中心：

- `/dashboard/content` 不再显示登录错误
- 能看到视频脚本资产
- 能看到图文草稿资产
- 默认选中视频脚本，显示脚本文本与 `review_pending`

历史页：

- `/dashboard/history` 不再显示登录错误
- 能看到咨询记录
- 能看到图文草稿记录
- 能看到视频脚本记录
- 能看到视频任务记录
- 视频任务记录显示 `c06eb471 succeeded`
- 详情显示 `状态：succeeded 当前阶段：completed 进度：100% 失败原因：无`

### 6. 平台管理台 settings

平台管理台登录：

- `/platform-admin-login` 使用授权的 `ADMIN_SETUP_SECRET` 登录成功
- 登录后进入 `/platform-admin`

系统配置页：

- `/platform-admin/settings` 可访问
- `LLM Runtime` 可读取
- `Consultation Agent` 可读取
- `System Prompt` 可读取
- `Enabled Skills / Tools` 可读取并显示勾选状态
- `Knowledge Runtime` 可读取
- 点击 `保存配置` 成功，无错误提示

已验证的工具/skill 勾选包括：

- `read_merchant_profile`
- `retrieve_knowledge_base`
- `read_history`
- `update_strategy_snapshot`
- `update_content_calendar`
- `generate_article_brief`
- `generate_video_brief`

### 7. 平台知识库

访问：

- `/platform-admin/knowledge`

上传 smoke 文档：

- 标题：`Staging Smoke Knowledge 2026-04-24T08:02:27`
- 内容：普拉提私教门店小红书获客、短视频钩子、信任细节、CTA 方法论

结果：

- 页面提示：`已入库「Staging Smoke Knowledge 2026-04-24T08:02:27」，生成 1 个知识片段。`
- 文档列表显示 `1 份文档`
- 文档状态：`indexed`
- chunks：`1`
- 页面提供 `重跑入库` 与 `删除` 操作

## 当前结论

截至本轮验收结束，staging 已通过完整 authenticated smoke：

- 商家注册 / 登录态：通过
- 商家资料保存：通过
- 咨询 agent loop：通过
- knowledge 检索前后状态：通过
- 图文草稿生成：通过
- 视频脚本生成：通过
- 视频任务创建：通过
- worker 处理并上传 COS 输出：通过
- 内容中心回显：通过
- 历史页回显：通过
- 平台 settings 读取 / 保存：通过
- 平台 knowledge 上传 / 入库 / 检索命中：通过

## 仍需注意

- 当前 worker 使用的是 `openstoryline-skeleton`，不是完整 OpenStoryline 上游。
- 视频工作台页面刷新后不会自动恢复刚创建的视频任务展示，但历史页可以看到任务成功记录。
- 本轮写入了 smoke 测试账号、邀请码、知识文档、咨询会话、图文草稿、视频脚本、视频任务和 COS 输出对象。
- 临时拉取的 Vercel env 文件位于 `/tmp/jingjing-staging-acceptance-20260424155519.env`，包含敏感 staging 配置。删除本地文件属于本地删除操作，需要用户单独确认后清理。
