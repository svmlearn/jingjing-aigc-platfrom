# 2026-04-24 Staging COS / Video Worker Zero-Memory Handoff

## 1. 你接手时先读什么

先按这个顺序读，别自己猜当前状态：

1. `AGENTS.md`
2. `docs/架构规范/2026-04-23-当前阶段技术决策-媒体存储与视频执行架构.md`
3. `docs/progress/2026-04-23-staging-cos-video-integration-verification.md`
4. `docs/progress/2026-04-23-staging-cos-cam-console-progress.md`
5. `docs/handoff/2026-04-23-staging-cos-cam-console-handoff.md`
6. `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
7. `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

如果你是来继续“真实环境联调”，重点不是再看旧探索稿，而是先确认：

- 代码主线已经集成到什么程度
- 腾讯云 / Vercel 外部配置做到哪一步
- 下一步到底先做 `Supabase migration` 还是先做 `服务器部署`

## 2. 当前总状态

当前主线不是“还在并行分支里”，而是：

- staging COS / Video Worker 相关代码已经集成到 `main`
- 当前 `HEAD`：`a4c40861099977f78a97f3ea24076433d068eaff`
- 这轮代码集成的验证文档在：
  - `docs/progress/2026-04-23-staging-cos-video-integration-verification.md`

也就是说，下一位不要再回头审 A/B/C/D 分支，也不要再把顶部 Review findings 当作“当前主线仍未修复”的事实。

### 顶部 Review findings 的判断

当前会话顶部反复出现的 4 条 review findings：

- `video_edit_jobs` 不应信任前端 `inputPayload`
- job detail 不应返回同一 variant 的所有历史资产
- worker runbook 缺少“如何把 compose 文件带到服务器”
- smoke checklist 失败演练方式和 skeleton 不一致

这些都是**历史问题**，已经在并行分支复审后修掉并进主线了。
下一位不要再把这 4 条当作当前阻塞点重新返工，除非你重新审主线代码后发现了新的回归证据。

## 3. 当前已经真实完成的外部配置

这部分不是文档计划，而是已经在真实控制台里做过的事实。

### 3.1 腾讯云 COS

已创建：

- APPID：`1341668543`
- 地域：`ap-singapore`
- 真实桶名：`jj-content-staging-1341668543`
- 权限：`私有读写`

已配置并保存 CORS：

- `http://localhost:3000`
- `https://jingjing-content-platform-staging.vercel.app`
- `https://*.vercel.app`
- 方法：`PUT / GET / POST / HEAD`
- `Allowed Headers = *`
- `Expose Headers = ETag, Content-Length`
- `Max Age = 600`
- `Response Vary = 开启`

### 3.2 腾讯云 CAM

已创建子账号：

- 用户名：`staging-cos-video-worker`
- 子账号 UIN：`100048364578`
- 子账号 UID：`24988130`

已创建并绑定策略：

- 策略名：`jj-content-staging-media-rw`
- 资源范围：
  - `qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543`
  - `qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543/*`

### 3.3 Vercel staging

项目：

- `jingjing-content-platform-staging`

已配置环境变量：

- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `COS_STS_DURATION_SECONDS`
- `COS_READ_URL_TTL_SECONDS`
- `MEDIA_UPLOAD_MAX_BYTES`

配置范围：

- `Production`
- `Preview`

实际固定值里，最关键的是：

- `COS_BUCKET=jj-content-staging-1341668543`
- `COS_REGION=ap-singapore`
- `COS_STS_DURATION_SECONDS=1800`
- `COS_READ_URL_TTL_SECONDS=3600`
- `MEDIA_UPLOAD_MAX_BYTES=1073741824`

已手动触发一次 redeploy，并确认新 deployment：

- 短 ID：`2uxaT2y7c`
- 状态：`Ready`

## 4. 当前还没做完的事

下一位接手时，真正未完成的是这 3 件事：

1. 跑 staging 的 Supabase migration
2. 把 `workers/video-worker/**` 部署到轻量服务器
3. 按 smoke checklist 联调整条链路

### 4.1 Supabase migration 现状

仓库里 migration 文件已经在：

- `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`

但这一步当前没有被本地直接推进，原因不是“忘了”，而是本地条件不完整：

- 当前没有确认到可直接使用的 `supabase` CLI
- `app/supabase/config.toml` 当前不存在

所以，下一位不要直接假设可以本地 `supabase db push`。
先判断你要走哪条路：

- 方案 A：安装并 link 正确的 Supabase 项目后再推
- 方案 B：直接在 Supabase Dashboard / SQL Editor 手工执行 migration

如果要快，通常 `Dashboard SQL Editor` 更直接。

### 4.2 轻量服务器 worker 部署

服务器本身已经买好，但 `workers/video-worker` 还没有真正部署上去。
下一位要按 runbook 做：

1. SSH 到轻量服务器
2. 安装 Docker / Compose
3. 建 `/srv/jingjing-video-worker`
4. 把 `workers/video-worker/**` 放到服务器
5. 写 `.env`
6. `docker compose up -d --build`

Worker `.env` 里必须同步同一组 COS 变量：

- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET=jj-content-staging-1341668543`
- `COS_REGION=ap-singapore`

### 4.3 Smoke test

联调文档已经有了，不要自己发明顺序：

- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

要验证的主链路是：

1. 浏览器直传素材到 COS
2. `/api/media/complete` 写入 `asset_objects`
3. 创建 `video_edit_jobs`
4. worker 轮询认领任务
5. 结果回传 COS
6. 前端拿签名 URL 预览
7. `[force_fail]` 失败演练

## 5. 当前最容易踩坑的地方

### 5.1 真实桶名不是原方案文档里的完整桶名

逻辑名还是：

- `jingjing-content-staging`

但真实创建出来的桶不是：

- `jingjing-content-staging-1341668543`

而是：

- `jj-content-staging-1341668543`

后续所有真实配置都必须以真实桶名为准，包括：

- CAM 资源字符串
- Vercel `COS_BUCKET`
- Worker `.env`
- smoke test 检查对象路径

### 5.2 那对子账号密钥要视为“已暴露”

原因不是仓库泄漏，而是用户后来在聊天里明文发过一次 `SecretId / SecretKey`。

所以当前策略是：

- 先继续用这对密钥把 `Worker` 和联调跑通
- 联调完成后，统一轮换 `staging-cos-video-worker` 的访问密钥
- 不要再把密钥写进任何文档、代码或新的聊天回复里

### 5.3 不要重做已经完成的 Vercel / CAM 步骤

除非发现真实配置丢失，否则不要重复：

- 再建 COS 桶
- 再建 CAM 策略
- 再填一次 Vercel COS 环境变量

这些都已经做完了。

## 6. 推荐下一步顺序

下一位最稳的顺序是：

1. 确认 `main` 代码就是当前基线，不再回头看旧分支
2. 先处理 `Supabase migration`
3. 再处理轻量服务器上的 `workers/video-worker` 部署
4. 再按 smoke checklist 联调
5. 联调完成后，轮换 CAM 子账号访问密钥
6. 最后补新的 `docs/progress/` 执行记录

## 7. 如果要联网继续操作

如果下一位要继续点腾讯云 / Vercel / Supabase 控制台：

- 必须使用 `[$web-access:web-access](/Users/wy/.codex/skills/web-access/SKILL.md)`
- 先跑 `check-deps.mjs`
- 先显示那句风险提示
- 再走 CDP

不要直接假设上一个窗口留下来的腾讯云 / Vercel tab 还在。
这次就发生过：第二天继续时，昨天的腾讯云 tab 已经不在了，需要重新开。

## 8. 当前结论

当前不是“从 0 开始”，而是：

- 代码主线已集成
- COS / CAM / Vercel 已真实配好
- 现在只差 `Supabase migration + Worker 部署 + Smoke test`

如果下一位照这份 handoff 接，就可以直接无缝继续工作。
不要再回到“要不要买服务器 / 要不要用 COS / OpenStoryline 能不能接入”的讨论阶段。
