# 02 COS 存储、上传与权限

## 摘要

COS 负责存大文件，数据库负责记录对象归属和状态。前端只拿临时上传凭证，不拿永久密钥；OpenStoryline / Pexels-compatible / 素材库外部预览给 60 天有效下载入口，优先走服务端下载 token URL，再由服务端校验后 302 到 COS 或流式转发。平台内登录态成片预览可走 app route 短期重签。

## 依据

外部依据：

- Tencent COS 临时密钥文档说明：永久密钥应存放在用户服务器，客户端通过服务端获取临时密钥后访问 COS。
- Tencent COS 预签名 URL 文档说明：预签名 URL 可通过签名有效期控制临时访问；本项目业务要求下载 URL 统一 60 天有效。
- OWASP 文件上传安全建议：上传服务访问前要做认证和授权，文件存储与应用执行环境隔离。
- Stack Overflow 预签名上传讨论给出的风险是：客户端声明的 `Content-Type` 和浏览器 `file.type` 不可信；只在签发 URL 前看前端声明不够。
- tus 协议把 `Upload-Expires` 和 checksum 作为长上传可靠性机制；本方案把 pending 上传过期、checksum / etag 校验、孤儿对象清理纳入门禁。
- 对象存储和数据库没有共同事务，社区常见做法是临时路径 + confirm 幂等 + 后台清理，而不是假装一次操作天然原子。

项目依据：

- 当前已有 `/api/media/upload-intents`、`/api/media/complete`。
- 当前 `asset_objects` 已支持 `owner_type = source_item | content_draft | content_variant | voice_profile`。
- 当前 voice profile audio key 前缀为 `voice-profiles/{merchant_id}/{voice_profile_id}/...`。

## 专业社区经验落地规则

COS 上传最容易出问题的点，不是“传不上去”，而是“传上去了但归属、类型、状态不可信”。本板块按社区常见事故把规则前置：

- STS 权限只给当前 upload intent 的单 key 或最小 prefix；不能给整个 bucket 写权限。
- 客户端传入的 `filename`、`mimeType`、`storageKey` 只作为请求素材，最终 key、owner、bucket 由服务端确认。
- `Content-Type` 和扩展名不能作为最终安全判断；complete 后必须读取对象头部或交给 worker 做真实类型探测。
- COS 写入成功和 DB 写入成功不是同一个事务；所有流程必须允许“对象已存在但 DB 失败”和“DB 已存在但对象缺失”两种修复。
- 下载地址默认不作为永久事实落库；落库的是 `storage_provider + bucket + key`，访问时签发业务入口 URL。
- 60 天下载不能由前端临时密钥签出；COS 文档中临时 key 会限制预签名 URL 实际有效期。可选方案是服务端用受限永久密钥生成 60 天 COS URL，或返回平台下载 URL：`/api/private-media/download/{download_token}`，token 60 天过期，请求时服务端重新签 COS 或代理下载。
- 平台内成片结果预览可以使用登录态保护的稳定 app route，例如 `/api/video-edit-jobs/{jobId}/result/{assetId}?disposition=inline`。这个 app route 每次请求时重新签短期 COS URL，不等同于给外部系统的 60 天裸 COS URL；用于下载时应提供独立 `?disposition=attachment` 入口。
- `COS_READ_URL_TTL_SECONDS` 可作为“内部 COS 重签跳转”的短 TTL；只有当响应直接交给 OpenStoryline、Pexels-compatible 接口或不依赖登录态的素材预览时，业务入口本身才必须满足 60 天可访问。

## 工作边界

商家团队素材路径，待实现：

```text
merchant-media/{merchant_id}/originals/{asset_id}/source.{ext}
merchant-media/{merchant_id}/clips/{asset_id}/{clip_id}.mp4
merchant-media/{merchant_id}/thumbs/{asset_id}/{clip_id}.jpg
```

个人声音路径，当前已有基础前缀：

```text
voice-profiles/{merchant_id}/{voice_profile_id}/{filename}
```

建议覆盖时细分为：

```text
voice-profiles/{merchant_id}/{voice_profile_id}/current/source.{ext}
voice-profiles/{merchant_id}/{voice_profile_id}/pending/{upload_id}/source.{ext}
```

视频结果继续沿用 worker 当前输出和 `asset_objects(owner_type = content_variant)` 回写。

上传状态机：

```text
intent_created
-> object_uploaded
-> post_upload_validating
-> completed
-> indexed / ready
```

失败状态：

```text
expired
validation_failed
complete_failed
orphaned
quarantined
```

## 硬门禁

上传 intent：

- 必须有登录态。
- 必须验证 owner 是否属于当前用户可操作的 `merchant_id`。
- 必须验证 `ownerType + assetType` 组合合法。
- 必须验证文件大小、MIME、扩展名。
- 必须把 STS 权限限制到单个 prefix 或单个 key。
- 必须拒绝客户端传入任意 COS key 覆盖系统路径。
- 必须写入或可重建 upload intent 记录，包含 `expires_at`、预期 MIME、预期大小、owner 信息和幂等 key。
- 必须给 upload intent 一个不可复用的 `upload_id` 或 idempotency key，用于重复 complete 时返回同一结果。

上传 complete：

- 必须验证 bucket 与配置一致。
- 必须验证 storage key 前缀与 `merchant_id + ownerType + ownerId` 一致。
- 必须验证 `storage_provider = tencent_cos`。
- 必须写入 `asset_objects` 或对应素材索引，不允许只信前端状态。
- 必须做对象落地后的真实类型检查；至少读取对象头部或由后台 worker 做 MIME sniff / ffprobe。
- complete 必须幂等：同一 key / owner 重复 complete 不得创建重复 ready 记录。
- complete 失败后不得把对象留在可检索路径。
- 若真实类型、大小、时长与 intent 不一致，必须进入 `validation_failed` 或 `quarantined`，不能降级为 warning。

下载：

- 必须由服务端检查权限和素材状态后生成 60 天有效下载 URL。
- URL 必须带 `expires_at = now + 60 days` 或等价 token 过期时间，过期后返回 401 / 410。
- 不允许把永久可访问 URL 写入可公开 payload。
- 跨商家或跨用户请求不得返回下载 URL。
- 素材被 `archived`、`quarantined`、`missing_object` 后，即使 60 天 URL 未到期，也必须在服务端下载入口拦截。
- 若直接签 COS 60 天 URL，签发用永久密钥只能留在服务端，且 CAM 权限必须限制为目标 bucket 的读对象能力。
- 平台内成片结果必须区分预览和下载：`signedPreviewUrl` 应走 `inline` 行为并能被 `<video>` 直接播放；`signedDownloadUrl` 应走 `attachment` 行为，由用户点击下载按钮触发。

## 检查功能

自动检查：

- `asset_objects.storage_key` 是否匹配 owner 预期前缀。
- COS 对象是否真实存在。
- bucket / region / key 是否和数据库一致。
- audio 类型是否只出现在 `owner_type = voice_profile`。
- 商家素材是否只出现在 `merchant-media/{merchant_id}/...`。
- intent 超时但 COS 对象已存在的 orphan 对象。
- complete 已成功但 post-upload validation 失败的对象。
- ETag / checksum 缺失或和预期不一致的对象。
- STS policy 是否超过当前 intent 范围，例如可写整个 `merchant-media/{merchant_id}`。

手动检查：

- 用 A 用户上传，B 用户访问，必须 403 或 404。
- 构造错误 bucketName，complete 必须失败。
- 构造跨 ownerId storageKey，complete 必须失败。
- 构造已下架素材的 60 天下载 URL，下载入口必须拒绝。

## 纠错功能

- 若 COS 对象存在但数据库无记录：标记为 orphan，可定期清理。
- 若数据库有记录但 COS 对象不存在：标记 `missing_object`，禁止返回下载 URL。
- 若 key 前缀不匹配：标记 `quarantined`，人工确认后删除或迁移。
- 若临时上传未 complete：超过 TTL 后清理。
- 若 post-upload validation 失败：删除对象或移动到 quarantine prefix，并删除 / 禁用 DB 记录。
- 若 complete 重复调用：返回已存在记录，不重复创建。
- 若清理任务失败：写入 `storage_cleanup_jobs`，后台补偿重试。

## 板块验收

- 前端拿不到永久 COS 密钥。
- 所有浏览器直传 key 都由服务端生成。
- 失败场景有明确错误码。
- 跨商家、跨用户、错 bucket、错 prefix 测试均失败。
