# 2026-04-23 staging COS + Video Worker Smoke Checklist

## 目标

这份清单用于人工验收 staging 四层链路有没有真的跑通：

```text
浏览器上传素材
-> Vercel 签发 COS 临时凭证
-> COS 存储素材
-> Supabase 写资产与任务记录
-> Worker 认领任务
-> OpenStoryline 执行
-> COS 回传成片
-> 前端预览与失败重试
```

这不是自动化测试脚本，而是一份给真人联调用的点检清单。

当前 staging 真实桶名固定为：

- `jj-content-staging-1341668543`

如果你在别的旧文档里还看到 `jingjing-content-staging-<APPID>`，以这里和最新 handoff 为准。

## 测试前提

开始之前，先确认下面几件事都已经完成：

- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md` 里的手工配置已完成
- staging Vercel 已重新部署
- staging Supabase migration 已部署到目标环境
- 轻量服务器上的 Docker Compose 服务已启动
- 你手里有一个可上传的小样本视频，建议 `MP4`，`30-90 秒`，大小 `<= 200MB`

虽然系统上限是 `1GB`，但 smoke test 不建议一上来就拿 `1GB` 文件测，先用小视频把链路跑通。

## 本轮测试素材建议

建议固定准备下面这组测试素材，后面每次联调都复用，方便比较：

| 名称 | 建议值 |
| --- | --- |
| 测试视频文件名 | `smoke-video-60s.mp4` |
| 时长 | `30-90 秒` |
| 大小 | `<= 200MB` |
| 分辨率 | `720p` 或 `1080p` |
| 用途 | 只做 staging 联调，不作为真实商家素材 |

## 需要记录的测试上下文

每次跑 smoke test 前，先把这张表填一下：

| 项目 | 本次值 |
| --- | --- |
| 测试日期 | `<待填写>` |
| 操作人 | `<待填写>` |
| Vercel 部署 URL | `<待填写>` |
| 商家 `merchant_id` | `<待填写>` |
| 草稿 `draft_id` | `<待填写>` |
| 视频脚本版本 `content_variant_id` | `<待填写>` |
| 测试素材文件名 | `smoke-video-60s.mp4` |
| 轻量服务器 IP | `<待填写>` |

## Smoke Case 1：上传素材到 COS

### 操作

1. 打开 staging 前端里某个 `content_draft` 详情页。
2. 点击“上传视频/图片素材”。
3. 选择 `smoke-video-60s.mp4`。
4. 等待上传完成，不要刷新页面。

### 预期结果

- 页面没有报错
- 前端先成功请求：
  - `POST /api/media/upload-intents`
- 浏览器随后直传 COS 成功
- 前端最后成功请求：
  - `POST /api/media/complete`

### 必查证据

#### 证据 A：COS 控制台

控制台路径：

`COS -> jj-content-staging-1341668543 -> 文件列表`

应该能看到新对象，路径前缀必须是下面两种之一：

- `draft-inputs/{merchantId}/{draftId}/...`
- `source-assets/{merchantId}/{sourceItemId}/...`

#### 证据 B：Supabase Table Editor

控制台路径：

`Supabase -> Table Editor -> asset_objects`

应该新增 1 行，至少满足：

| 字段 | 预期 |
| --- | --- |
| `owner_type` | `content_draft` |
| `asset_type` | `video` 或 `image` |
| `storage_provider` | `tencent_cos` |
| `bucket_name` | `jj-content-staging-1341668543` |
| `storage_key` | 以 `draft-inputs/` 或 `source-assets/` 开头 |
| `etag` | 非空 |

### 通过标准

只有“COS 有对象”且“Supabase 有 `asset_objects` 记录”同时成立，这一步才算通过。

## Smoke Case 2：创建视频任务

### 操作

1. 打开某个 `video_script` 类型的内容版本详情页。
2. 点击“生成视频”。
3. 填写必要说明后提交。

### 预期结果

- 页面提交成功
- `video_edit_jobs` 表中出现 1 条新任务

### 必查证据

#### 证据 A：前端页面

- 页面出现任务卡片或任务详情入口
- 初始状态应该是：
  - `pending`
  - 或刚创建就很快变成 `queued`

#### 证据 B：Supabase Table Editor

控制台路径：

`Supabase -> Table Editor -> video_edit_jobs`

至少确认：

| 字段 | 预期 |
| --- | --- |
| `merchant_id` | 等于当前商家 |
| `draft_id` | 等于当前草稿 |
| `content_variant_id` | 等于当前视频脚本版本 |
| `status` | `pending` 或 `queued` |
| `retry_count` | `0` |
| `instruction_text` | 非空或按页面输入值 |

### 通过标准

任务创建动作不能只在前端弹成功消息，必须在 `video_edit_jobs` 里看到真实记录。

## Smoke Case 3：Worker 成功认领任务

### 操作

SSH 登录轻量服务器后执行：

```bash
cd /srv/jingjing-video-worker
docker compose ps
docker compose logs -f video-worker
```

### 预期结果

- `openstoryline-engine` 和 `video-worker` 都是 `Up`
- 新任务在 `10` 秒左右被 Worker 认领

### 必查证据

#### 证据 A：Worker 日志

日志里应该能看到类似含义的信息：

- 轮询拿到任务
- 任务状态从 `pending` 变成 `queued`
- 再进入 `preparing`
- 然后进入 `running`

#### 证据 B：Supabase Table Editor

`video_edit_jobs` 同一条记录的 `status` 应按下面顺序推进：

```text
pending -> queued -> preparing -> running
```

`current_stage` 和 `progress_pct` 应该开始变化，而不是一直停在初始值。

### 通过标准

只要任务一直停在 `pending` 超过 `30` 秒，就先判定这一项失败，优先排查 Worker 是否真的连上了数据库。

## Smoke Case 4：COS 回传成片、封面、字幕

### 操作

等待任务执行结束。

### 预期结果

任务成功后，COS 桶里应该至少出现：

- `final.mp4`
- `cover.jpg`

如果当前链路开启字幕，也应该出现：

- `subtitles.srt`

### 必查证据

#### 证据 A：COS 控制台

控制台路径：

`COS -> jj-content-staging-1341668543 -> 文件列表`

应该看到下面这些路径：

```text
video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4
video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg
video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt
```

注意：

- `subtitles.srt` 是“可选”
- `final.mp4` 和 `cover.jpg` 是本轮最小成功标准

#### 证据 B：Supabase Table Editor

`asset_objects` 里应该新增结果资产记录，至少满足：

| 字段 | 预期 |
| --- | --- |
| `owner_type` | `content_variant` |
| `asset_type` | `video` / `cover` / `subtitle` |
| `storage_provider` | `tencent_cos` |
| `bucket_name` | `jj-content-staging-1341668543` |
| `storage_key` | 以 `video-outputs/`、`video-covers/`、`video-subtitles/` 开头 |

#### 证据 C：任务表

`video_edit_jobs.status` 最终应为：

- `succeeded`

并且：

- `finished_at` 非空
- `result_payload` 非空

### 通过标准

成片文件一定要已经写进 COS，不能只停留在服务器本地目录。

## Smoke Case 5：前端预览成片

### 操作

1. 回到视频任务详情页。
2. 刷新页面。
3. 点击播放成片。
4. 查看封面是否正常展示。

### 预期结果

- 页面能拿到临时签名预览链接
- 视频能在前端直接播放
- 封面图能正常显示

### 必查证据

- 不需要把签名 URL 落库
- 任务详情接口返回的资产对象里应附带 `signedPreviewUrl`
- 刷新页面后应能重新获取一条新的可用签名 URL

### 通过标准

“数据库里有文件记录”不算预览通过，必须真人能在页面上看到并播放。

## Smoke Case 6：失败重试

### 先说明当前适用范围

这一条要和当前 C 线 worker skeleton 保持一致。

截至当前 C 线实现 commit `052c57c6afad8c475f76579b0eedec23370615c4`，可控失败机制不是“改错 `OPENAI_API_KEY`”，而是：

- 让任务的 `instruction_text` 包含字面量：
  - `[force_fail]`

当前 skeleton 的 `openstoryline-engine` 看到这个标记后，会主动返回一次受控失败，供我们验证：

- `failed_retryable`
- 人工 retry
- 重新进入 `pending -> queued -> preparing -> running`

等后面真实 OpenStoryline 引擎接入后，这个失败演练方式大概率要换，所以这一条只适用于“当前 skeleton 仍然在用”的阶段。

### 方案 A：如果页面能填写 instruction_text

这是最简单的跑法：

1. 打开视频脚本版本页。
2. 点击“生成视频”。
3. 在说明 / 指令输入框里填一段测试文案，并且包含：
   - `[force_fail]`
4. 提交任务。

示例：

```text
smoke retry test [force_fail]
```

### 方案 B：如果当前页面还没有暴露 instruction_text 输入框

那就按下面这套更稳的步骤跑：

1. 先暂停 worker，避免任务被立刻认领：

```bash
cd /srv/jingjing-video-worker
docker compose stop video-worker
```

2. 在前端正常创建 1 条视频任务。
3. 打开：
   - `Supabase -> Table Editor -> video_edit_jobs`
4. 找到刚创建的那条任务。
5. 把它的 `instruction_text` 改成包含：
   - `[force_fail]`
6. 保存记录。
7. 再恢复 worker：

```bash
cd /srv/jingjing-video-worker
docker compose start video-worker
```

### 预期结果

第一次运行后，任务应进入：

- `failed_retryable`

失败原因中应能看到与受控失败一致的字样，例如：

- `forced engine failure`

之后点击“重试”或调用 retry API 以后：

- `retry_count` 加 `1`
- 任务会被重新置回 `pending`
- Worker 再次认领并重新推进：
  - `queued`
  - `preparing`
  - `running`

### 必查证据

#### 证据 A：任务表

`video_edit_jobs` 中同一条任务应满足：

| 阶段 | 预期 |
| --- | --- |
| 第一次失败后 | `status = failed_retryable` |
| 第一次失败后 | `failure_reason` 包含 `forced engine failure` 或等价错误 |
| 点击重试后 | `retry_count = 1` |
| 点击重试后 | 任务先被重新置回 `pending`，再被 worker 认领 |

#### 证据 B：Worker 日志

在服务器执行：

```bash
cd /srv/jingjing-video-worker
docker compose logs -f video-worker
```

你应能看到：

- 任务被认领
- OpenStoryline skeleton 调用失败
- worker 将任务标记为失败

#### 证据 C：前端

- 页面能显示失败原因
- 页面存在“重试”入口
- 点击后不是只改前端文案，而是真的触发任务重跑

### 通过标准

失败不是问题，失败后能被人工安全重试，才是本轮需要的能力。

## Smoke Case 7：重启恢复

### 操作

当存在一条 `running` 任务时，手工重启 Worker：

```bash
cd /srv/jingjing-video-worker
docker compose restart video-worker
```

### 预期结果

- Worker 重启后不会永久卡死
- 超过阈值的卡死任务会被扫回：
  - `failed_retryable`

### 必查证据

- `video_edit_jobs.status` 最终不是永久停在 `running`
- 日志里能看到 stale job 扫描或回收动作

### 通过标准

如果任务重启后一直卡在 `running`，说明“异常恢复”这一项还没过关。

## 本轮验收结果记录表

每跑一轮 smoke test，都把下面这张表补一遍：

| 用例 | 结果 | 备注 |
| --- | --- | --- |
| 上传素材到 COS | `<通过/失败>` | `<待填写>` |
| 创建视频任务 | `<通过/失败>` | `<待填写>` |
| Worker 认领任务 | `<通过/失败>` | `<待填写>` |
| COS 回传成片 | `<通过/失败>` | `<待填写>` |
| 前端预览成片 | `<通过/失败>` | `<待填写>` |
| 失败重试 | `<通过/失败>` | `<待填写>` |
| 重启恢复 | `<通过/失败>` | `<待填写>` |

## 失败时优先排查顺序

如果联调失败，不要乱跳着查，先按这个顺序：

1. Vercel 环境变量是否已补齐并重新部署
2. COS 桶是否真的是 `私有读写`
3. CORS 是否已保存
4. CAM 子账号策略是否只绑到了正确桶
5. Worker `.env` 是否填对
6. Worker 容器是否真的起来了
7. Supabase `video_edit_jobs` 是否真有记录
8. COS 文件是否已经上传成功

这样最容易把问题快速收敛到一层，而不是四层一起猜。
