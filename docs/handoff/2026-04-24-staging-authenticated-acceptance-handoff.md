# 2026-04-24 Staging Authenticated Acceptance Handoff

## 1. 当前目标

在 staging 三层部署完成后，做真实登录态验收，确认：

- 商家端能完整跑咨询、图文、视频、内容中心、历史页
- worker 能处理商家端创建的视频任务
- 平台管理台能配置 settings
- 平台管理台能上传 knowledge
- 咨询 agent 能命中新入库 knowledge

## 2. 当前环境

- Staging 域名：`https://jingjing-content-platform-staging.vercel.app`
- Supabase Project Ref：`jrveaabguddromjtibbs`
- Worker Server：`ubuntu@43.160.208.189`
- COS Bucket：`jj-content-staging-1341668543`

本轮没有使用 `/Users/wy/Documents/wy.pem`，没有碰 `openclaw`。

## 3. 测试数据

邀请码：

- `JJ-SMOKE-20260424075628-305A30`

测试商家：

- Email：`codex-smoke-jj-smoke-20260424075628-305a30@example.com`
- Merchant：`静境 Staging Smoke 8-305a30`
- Merchant ID：`ba54a996-1dd7-4468-9c54-54419f4fa5fc`

咨询会话：

- Session ID：`d5057399-05c9-4aa1-9c9d-6d9d8254022f`

视频任务：

- Job ID：`c06eb471-d87f-4383-9cc8-db813338d317`
- Status：`succeeded`
- Stage：`completed`
- Progress：`100`

知识库 smoke 文档：

- Title：`Staging Smoke Knowledge 2026-04-24T08:02:27`
- Status：`indexed`
- Chunks：`1`

## 4. 已完成

### 商家端

- 注册测试商家成功
- 保存商户资料成功
- 咨询会话创建成功
- 用户消息发送成功
- agent loop 工具卡出现并更新
- 图文草稿生成成功
- 视频脚本生成成功
- 视频任务创建成功
- worker 处理成功
- 内容中心回显图文草稿与视频脚本成功
- 历史页回显咨询、图文、脚本、视频任务成功

### Worker

worker 成功处理商家端创建的视频任务：

- `video_edit_jobs.status = succeeded`
- `current_stage = completed`
- `progress_pct = 100`
- `asset_objects` 写入 3 条输出

输出包括：

- `final.mp4`
- `cover.jpg`
- `subtitles.srt`

### 平台管理台

- `/platform-admin-login` 登录成功
- `/platform-admin/settings` 可读取配置
- `System Prompt` 可读取
- enabled skills/tools 可读取
- `Knowledge Runtime` 可读取
- 点击 `保存配置` 成功
- `/platform-admin/knowledge` 可上传文档
- smoke 文档入库成功，状态为 `indexed`

### Knowledge 检索

知识文档入库后再次发送咨询消息：

- `retrieve_knowledge_base` 显示 `命中 1 个平台知识片段`
- assistant 回复引用 `Staging Smoke Knowledge 2026-04-24T08:02:27`

## 5. 当前剩余问题

- `openstoryline-engine` 仍是 skeleton，不是真实上游 OpenStoryline。
- 视频工作台刷新后不会自动恢复已创建任务的展示状态；历史页可以看到任务成功记录。
- 未清理本轮 smoke 数据。
- 本地 `/tmp/jingjing-staging-acceptance-20260424155519.env` 包含敏感 staging env，需要用户确认后才能删除。
- 主目录 Git 仍可能受 iCloud dataless 影响，本轮没有 commit / push。

## 6. 下一步建议

1. 确认是否清理本轮 smoke 数据和本地临时 env 文件。
2. 如果要继续产品验收，优先从 `codex-smoke-jj-smoke-20260424075628-305a30@example.com` 这个测试商家看端到端演示。
3. 如果要修 UI，优先修两个点：
   - 未登录时商家端部分页面展示 `Please sign in first.`，应改成友好登录/注册引导。
   - 视频工作台刷新后不恢复最近视频任务状态，应从 API 拉取 session 关联的最新任务。
4. 如果要进入生产化，应把 `platform-admin-login` 从共享口令升级成正式管理员账号体系。

## 7. 当前结论

staging 已具备可演示的端到端闭环：

商家注册 -> 商户资料 -> 咨询 agent loop -> 图文草稿 -> 视频脚本 -> 视频任务 -> worker 出片 -> 内容中心 / 历史页回显 -> 平台 settings / knowledge 配置 -> 知识检索命中。
