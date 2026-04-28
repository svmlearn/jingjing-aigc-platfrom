# 2026-04-28 素材校验步骤验证

## 目标

验证视频链路里“素材校验”的实际步骤是否已经落在 app 和 video-worker 两侧，而不是只存在于文档描述中。

## 当前结论

素材校验分两道门：

1. 素材文件本体必须上传到 COS，不写入 DB。
2. app 创建 `video_edit_jobs.input_payload` 前校验素材是否有可下载的 COS 对象信息。
3. DB 只保存 `asset_objects` 元数据、素材绑定关系和 `video_edit_jobs` 状态，不承载素材文件本体。
4. video-worker 执行前兜底校验 `input_payload.input_assets` 合同，并把合同错误标记为 `failed_manual`。

正常 app 链路已经能满足当前架构文档要求；但 worker 侧仍保留部分缺省兜底，见下方“口径差异”。

## 已核对步骤

### app 侧

文件：

- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-job-payload.test.ts`

已核对：

- 脚本必须已确认，且正文非空。
- 只把 `image` / `video` 类型素材映射为 `input_assets`。
- `storageProvider` 必须是 `tencent_cos`。
- `storageKey` trim 后不能为空。
- `bucketName` trim 后不能为空。
- 素材字段会 trim 并按 `sortOrder`、`asset_id` 稳定排序。
- 已确认 material references 但没有可下载 input assets 时，会阻断创建 job。

验证命令：

```bash
cd app
node --test src/server/api/video-job-payload.test.ts
```

结果：

```text
tests 10
pass 10
fail 0
```

备注：Node 输出了 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告，不影响测试通过。

### worker 侧

文件：

- `workers/video-worker/worker/app/models.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/tests/test_processor_contract.py`

已核对：

- `input_payload` 必须是对象。
- `input_assets` 必须是列表。
- 每个 input asset 必须是对象。
- `storage_provider` 为空时允许使用默认逻辑；非空时必须是 `tencent_cos`。
- `storage_key` 必须是非空字符串。
- `bucket_name` 为空时使用 worker 默认 bucket；显式传入时必须是非空字符串。
- `file_name` 必须是安全文件名，不能包含路径、绝对路径、斜杠、反斜杠或冒号。
- 素材合同错误会进入 `input_asset_validation_failed`，状态为 `failed_manual`，不会下载素材或调用引擎。
- COS 下载失败属于基础设施错误，状态为 `failed_retryable`。

## 口径差异

当前架构文档要求 `input_assets` 中：

- `storage_provider` 必须是 `tencent_cos`。
- `bucket_name` 必须非空。
- `storage_key` 必须非空。

当前 app 侧实现与该要求一致，会在创建 job 前阻断不合规素材。

当前 worker 侧实现略宽松：

- `storage_provider` 缺省时允许通过；显式传入非 `tencent_cos` 才失败。
- `bucket_name` 缺省时使用 worker 默认 bucket；显式传入空字符串或非字符串才失败。

影响：

- 通过 app 创建 job 的正常路径没有问题。
- 如果有人绕过 app 直接写入 `video_edit_jobs.input_payload`，worker 不会完全按“provider/bucket 必填”口径阻断缺省字段。

建议：

- 若以 `2026-04-28-current-architecture.md` 为最终合同，应后续把 worker 侧也收紧为 provider/bucket 必填，并补两个 worker 回归测试。
- 若保留 worker 默认 bucket 兼容旧 job，则需要在架构文档里明确这是 worker 兜底能力，而不是正式 app-worker 合同。

验证命令：

```bash
cd workers/video-worker
python -m pytest tests/test_processor_contract.py -q
```

结果：

```text
15 passed in 0.83s
```

## 环境备注

本次尝试使用 `rg` 检索时，WindowsApps 内置 `rg.exe` 返回 `Access is denied`，后续改用 PowerShell `Select-String` 完成检索。

本次未做真实 COS 下载、真实 worker 轮询、真实 FireRed 出片验证；只验证素材校验的代码级合同步骤。

## 真实依赖补充验证

### 2026-04-28 真实 COS roundtrip

本次补充执行了 worker 自带真实依赖 smoke。

准备：

```bash
cd workers/video-worker
python -m pip install -r worker/requirements.txt
```

执行：

```powershell
# 当前进程合并加载 workers/video-worker/.env 和 app/.env.local
$env:PYTHONPATH=(Resolve-Path -LiteralPath '.').Path
python -m worker.app.real_io_smoke
```

结果：

- 首次执行缺少 Python 依赖 `psycopg` / `qcloud_cos`，安装 `worker/requirements.txt` 后继续。
- 合并 app `.env.local` 后，COS 真实 roundtrip 通过：
  - bucket：`jj-content-staging-1341668543`
  - region：`ap-singapore`
  - 上传临时对象：`worker-real-smoke/*.txt`
  - 下载字节数：37
  - `roundtrip_matched=true`
  - 已删除临时对象
- Supabase DB 直连未通过，但这不影响“素材文件上传到 COS”的结论：
  - worker `.env` 当前 `SUPABASE_DB_URL` 主机为 `db.example.supabase.co`
  - TCP 5432 可连通，但 `psycopg` 连接被服务端关闭
  - 结论：当前本机 worker `.env` 不是可用 staging DB 直连配置，因此不能验证真实 `video_edit_jobs` 轮询/回写；这属于 job 编排链路，不属于素材文件上传链路

### 2026-04-28 真实素材对象 + worker 合同校验

为贴近“素材校验”本身，额外执行了一次不依赖 DB 的真实 COS 输入素材校验：

步骤：

1. 使用真实 COS 配置上传临时输入素材对象。
2. 构造 `VideoJob.input_payload.input_assets`，引用该真实 COS 对象。
3. 调用 worker 的 `VideoJob.input_assets()` 执行合同校验。
4. 调用真实 `TencentCosClient.download_file()` 下载对象。
5. 校验下载内容与上传内容一致。
6. 构造三类坏素材，确认在下载前被 `InputAssetContractError` 阻断。
7. 删除临时 COS 对象。

结果：

- 临时对象：`worker-real-smoke/input-assets/*.mp4`
- `valid_asset_contract=ok`
- 下载字节数：43
- `download_matched_upload=true`
- `cleanup_deleted=true`
- `unsupported_provider` 被阻断，`failure_code=invalid_input_assets`
- `unsafe_file_name` 被阻断，`failure_code=invalid_input_assets`
- `missing_storage_key` 被阻断，`failure_code=invalid_input_assets`

本次真实校验已经覆盖：

- 素材文件本体走 COS。
- 真实 COS 写入。
- 真实 COS 下载。
- worker 输入素材合同校验。
- 非法素材下载前阻断。
- 临时对象清理。

素材上传口径：

- 上传是否成功，以 COS 写入、读取和内容一致为准。
- DB 不存素材文件本体。
- DB 只在业务链路里保存素材元数据和绑定关系，例如 `asset_objects.storage_provider/bucket_name/storage_key`。

本次仍未覆盖：

- 真实 Supabase `asset_objects` 元数据写入。
- 真实 Supabase `video_edit_jobs` 读写。
- worker 真实轮询 claim。
- 真实 FireRed/OpenStoryline 出片。

阻塞原因：

- 本机 `workers/video-worker/.env` 的 `SUPABASE_DB_URL` 是占位 DB 地址，不是可用 staging DB 直连地址。
- 这只阻塞 DB 元数据 / job 编排验证，不阻塞 COS 素材上传验证。

### 2026-04-28 app 侧 COS 上传意图 / 临时凭证验证

继续按“素材本体只走 COS，不走 DB”的口径补充验证 app 侧上传路径。

代码核对：

- `app/src/server/api/media-service.ts`
  - `createMediaUploadIntentForUser()` 负责生成 COS key 和临时凭证。
  - `completeMediaUploadForUser()` 才写入 `asset_objects` 元数据。
- `app/src/server/api/cos.ts`
  - `issueCosUploadCredentials()` 使用腾讯云 STS 签发限制到单个 `cosKey` 的临时上传凭证。
  - `getCosUploadKeyPrefix()` 将 `content_draft` 素材放到 `draft-inputs/{merchantId}/{ownerId}`。
- `app/src/lib/ui/video-workflow.ts`
  - `uploadDraftMediaFile()` 调用 `/api/media/upload-intents`。
  - 然后用 COS SDK `sliceUploadFile` 或 `putObject` 直传 `intent.cosKey`。
  - 最后调用 `/api/media/complete` 只提交 `storageProvider/bucketName/storageKey/mimeType/sizeBytes/etag` 等元数据。
- `app/src/components/merchant/video-workbench.tsx`
  - 分镜素材上传入口调用 `uploadDraftMediaFile()`。

真实验证：

- 使用 `app/.env.local` 的 COS 配置。
- 按 app 的 STS policy 方式签发临时凭证。
- 临时凭证只允许写入一个指定 `draft-inputs/.../*.mp4` key。
- 使用临时凭证上传测试素材到 COS。
- 使用正式 COS client 读回对象并校验内容一致。
- 使用同一临时凭证尝试写另一个 key，结果被 COS 拒绝。
- 删除临时对象。

结果：

- bucket：`jj-content-staging-1341668543`
- region：`ap-singapore`
- key：`draft-inputs/merchant-real-smoke/draft-real-smoke/*.mp4`
- `tempCredentialIssued=true`
- `tempCredentialHasToken=true`
- `directUploadWithTempCredential=ok`
- `deniedKeyUploadBlocked=true`
- `deniedKeyUploadErrorCode=AccessDenied`
- `readBackBytes=41`
- `readBackMatched=true`
- `cleanupDeleted=true`

结论：

- app 侧上传意图对应的真实 COS/ST​S 上传链路可用。
- 临时凭证有 key 级别限制，不能拿一个素材上传凭证写其他对象。
- 素材文件本体确实走 COS。
- `/api/media/complete` 是后置元数据登记，不是文件上传本体。

### 2026-04-28 worker 拦截坏素材验证

本次用户纠偏：要验证的不是“能不能上传”，而是“worker 能不能在执行前拦下不对的素材”。

执行方式：

- 直接调用 `JobProcessor.process()`，不是只测 `VideoJob.input_assets()`。
- 使用记录型 fake repository / fake COS / fake engine。
- 重点观察：
  - job 是否被标记为 `failed_manual`。
  - `current_stage` 是否为 `input_asset_validation_failed`。
  - `failure_reason` 是否带 `invalid_input_assets`。
  - COS 下载是否未发生。
  - engine 调用是否未发生。
  - output upload 是否未发生。

覆盖坏素材类型：

- `input_assets` 不是 list。
- input asset 不是 object。
- 缺少 `storage_key`。
- `storage_provider` 不是 `tencent_cos`。
- 显式传入空 `bucket_name`。
- `file_name` 包含路径穿越。

结果：

| Case | status | current_stage | download_count | engine_call_count |
| --- | --- | --- | --- | --- |
| `input_assets_not_list` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |
| `asset_not_object` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |
| `missing_storage_key` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |
| `unsupported_provider` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |
| `empty_bucket_name` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |
| `unsafe_file_name` | `failed_manual` | `input_asset_validation_failed` | 0 | 0 |

固定回归测试：

```bash
cd workers/video-worker
python -m pytest tests/test_processor_contract.py -q
```

结果：

```text
15 passed in 0.40s
```

结论：

- worker 可以在执行前拦下不合规素材。
- 被拦截的坏素材不会进入 COS 下载。
- 被拦截的坏素材不会进入 OpenStoryline / FireRed 引擎调用。
- 被拦截的坏素材不会进入 output upload。
