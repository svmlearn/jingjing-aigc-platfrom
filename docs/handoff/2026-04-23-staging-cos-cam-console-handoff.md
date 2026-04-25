# 2026-04-23 staging COS / CAM 控制台操作 Handoff

## 2026-04-25 状态校正

本 handoff 是 `2026-04-23` 当时的控制台操作交接。下面“未完成 / 下一步建议 / 未验证”的内容已经被后续执行记录覆盖。

截至 `2026-04-25` 复核，当前最新状态为：

- Supabase 视频链路 migration `202604230001_v01_staging_cos_video_schema.sql` 已执行。
- 轻量服务器 worker 已部署并启动。
- worker 已完成真实 smoke，成功 job 为 `d163e088-b0ae-4850-a476-4ce591a7124f`。

最新事实来源：

- `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/docs/progress/2026-04-24-staging-video-worker-server-bootstrap-and-smoke.md`
- `docs/progress/2026-04-24-staging-full-deploy-current-target.md`
- `docs/progress/2026-04-25-supabase-migration-current-state.md`

## 1. 当前目标

在真实腾讯云控制台里完成 staging 的 `COS + CAM` 基础设施配置，为后续 `Vercel + Supabase + Video Worker` 联调做准备。

这轮目标原本包括：

1. 创建 staging COS 私有桶
2. 配置 CORS
3. 创建 staging 专用 CAM 子账号
4. 创建并绑定最小权限自定义策略

本轮目前已经完成第 1、2、3、4 步，接下来可以从 `Vercel staging` 环境变量配置继续。
目前连 `Vercel staging` 环境变量配置和 redeploy 也已经做完，下一步可以从 `Supabase migration` 或 `轻量服务器部署` 继续。

## 2. 本轮已完成

### 2.1 COS

已真实创建 COS 桶：

- APPID：`1341668543`
- 地域：`ap-singapore`
- 完整桶名：`jj-content-staging-1341668543`
- 访问权限：`私有读写`

已真实配置并保存 CORS：

- `http://localhost:3000`
- `https://jingjing-content-platform-staging.vercel.app`
- `https://*.vercel.app`
- 方法：`PUT / GET / POST / HEAD`
- `Allowed Headers = *`
- `Expose Headers = ETag, Content-Length`
- `Max Age = 600`
- `Response Vary = 开启`

### 2.2 CAM

已真实创建 CAM 子账号：

- 用户名：`staging-cos-video-worker`
- 访问方式：`编程访问`
- 控制台访问：未开启
- 子账号 UIN：`100048364578`
- 子账号 UID：`24988130`

已真实创建并绑定自定义策略：

- 策略名：`jj-content-staging-media-rw`
- 关联目标：`staging-cos-video-worker`

策略资源已按真实桶名收口为：

```text
qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543
qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543/*
```

### 2.3 Vercel

已在 `jingjing-content-platform-staging` 中新增：

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

环境变量保存后，已触发一次新的 production redeploy，新的 deployment：

- 短 ID：`2uxaT2y7c`
- 状态：`Ready`

## 3. 当时本轮未完成

`2026-04-23` 当时仍待完成；截至 `2026-04-25` 已被后续执行补齐，见本文顶部“2026-04-25 状态校正”。

1. 跑 staging 的 Supabase migration
2. 部署轻量服务器上的 `workers/video-worker`
3. 把同一组 COS 变量同步到 Worker `.env`
4. 跑 smoke test

## 4. 关键事实

### 4.1 真实桶名与原方案不一致

原先文档里的逻辑命名是：

- `jingjing-content-staging`

但真实控制台里，这个前缀加上 `-1341668543` 后会超出腾讯云允许的完整桶名长度，所以本次已实际落地为：

- `jj-content-staging-1341668543`

后续一切真实配置都必须以这个桶名为准，不要再按旧文档里的完整桶名直接照抄。

### 4.2 密钥没有落仓库

子账号创建成功页展示过一次性的 `SecretId / SecretKey`，但：

- 没有写入仓库
- 不应写进 handoff
- 不应在后续聊天里明文回显

下一位继续前，必须先确认用户已经安全保存了这两个值。

这是继续推进到 Vercel / Worker 的真实阻塞点：

- 现在已经不再阻塞 Vercel，因为变量已经填完
- 但 Worker `.env` 仍然要用到同一组密钥
- 同时，这组密钥曾在聊天中明文出现，后续应视为已暴露凭证，建议在 Worker 联调完成后统一轮换

## 5. 当时下一步建议

`2026-04-23` 当时下一位接手时，建议严格按这个顺序继续：

1. 先跑 `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`
2. 再把同一组 COS 变量写进轻量服务器上的 Worker `.env`
3. 启动 `workers/video-worker` 对应的 compose
4. 然后按 smoke checklist 联调
5. 联调完成后，统一轮换 `staging-cos-video-worker` 的访问密钥

建议使用的策略名：

- `jj-content-staging-media-rw`

策略资源字符串应以真实桶名为准：

```text
qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543/*
```

## 6. 改动文件

本轮为了留痕，新增：

- `docs/progress/2026-04-23-staging-cos-cam-console-progress.md`
- `docs/handoff/2026-04-23-staging-cos-cam-console-handoff.md`

本轮没有改任何代码文件。

## 7. 验证结果

本轮是“真实外部控制台操作”，不是本地代码验证。

已真实验证：

- COS 桶创建成功
- COS CORS 保存成功
- CAM 子账号创建成功
- CAM 自定义策略创建成功
- CAM 策略绑定成功
- Vercel staging 环境变量保存成功
- Vercel 新 deployment 已 `Ready`

当时未验证：

- Vercel / Worker / Supabase 联调

## 8. 当前分支 / commit / push / merge

- 当前目录：主工作区
- 当前分支：`main`
- 本轮未创建 commit
- 本轮未 push
- 本轮未 merge

如果后续要把这轮操作继续推进到“可联调”，建议在完成 CAM 策略绑定后，再补一份新的 `docs/progress/` 执行记录。
