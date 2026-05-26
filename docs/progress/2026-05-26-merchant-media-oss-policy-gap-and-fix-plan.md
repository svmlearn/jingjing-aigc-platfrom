# 2026-05-26 merchant-media OSS 权限缺口与新视频素材库收口方案

## 当前判断

结论：`merchant-media/` 前缀写入失败不是因为本次手动导入“没走正常上传流程”才产生的单点问题，而是生产 OSS/RAM policy 没有覆盖新视频素材 clip 库前缀。

当前系统存在两套尚未完全收口的媒体路径：

| 路径 | 当前用途 | OSS 前缀 | 当前生产权限 | 状态 |
| --- | --- | --- | --- | --- |
| 素材库 / 普通项目媒体上传 | `source_items + asset_objects` | `source-assets/<merchantId>/<sourceItemId>/...` | 可写 | 当前正常上传使用 |
| 新视频素材 clip 库 | `merchant_media_assets + merchant_media_clips` | `merchant-media/<merchantId>/{originals,clips,thumbs}/...` | 不可写 | 新表合同已存在，但 OSS 权限未补齐 |

因此：

- 普通商家端上传视频本身不会因为 `merchant-media/` 权限失败，因为它当前生成的是 `source-assets/` key。
- 任何后续流程只要要进入新视频素材 clip 库，即写 `merchant-media/`，都会遇到同一个 `AccessDenied`。
- 本次手动导入只是提前暴露了这个基础设施缺口。

## 代码证据

正常浏览器上传 / complete 合同中，`source_item` 对应前缀是 `source-assets/`：

- `app/src/lib/media-upload-contract.ts`
- `app/src/server/storage/object-storage.ts`

新视频素材库合同要求 `merchant-media/`：

- `app/src/lib/merchant-media-library-contract.ts`
- `app/src/lib/merchant-media-manifest.ts`
- `app/src/lib/db/merchant-media-repository.ts`

当前 legacy 视频素材兼容检索来自：

- `app/src/lib/db/merchant-media-repository.ts`
- `listLegacyMaterialClipsByMerchantFromPostgres`

它读取：

- `source_items.trace_payload.materialLibrary = true`
- `trace_payload.materialAnalysis.materialCategory = project_media_asset`
- `trace_payload.materialAnalysis.assetType = video`
- `structure_summary.materialStatus = ready`
- `asset_objects.storage_provider = aliyun_oss`

## 生产验证事实

已验证当前生产 OSS 凭证：

- `source-assets/`：可写。
- `draft-inputs/`：可写。
- `video-results/`：可写。
- `merchant-media/`：写入失败，OSS 返回 `AccessDenied`。

本次 `shaokao@163.com` 导入最终采用 legacy 兼容路径：

- `ready_legacy_video_assets = 94`
- `merchant_media_assets = 0`
- `merchant_media_clips = 0`

这不是最终理想态，但当前 video-worker/private media 兼容检索可读到这 94 条素材。

## 为什么不能靠改 bucket ACL

不能把 bucket 改 public，也不应该给当前 RAM 主体 `AliyunOSSFullAccess`。

正确做法是给当前生产 `ALIYUN_OSS_ACCESS_KEY_ID` 对应的 RAM 用户或 RAM 角色补最小前缀权限。

阿里云 OSS RAM Policy 的关键规则：

- `GetObject / PutObject / DeleteObject` 可授权到具体 object 前缀：`bucket/prefix/*`
- `ListObjects` 的 `Resource` 必须是 bucket 本身，再用 `oss:Prefix` 条件限制可列举目录

官方参考：

- https://help.aliyun.com/zh/oss/user-guide/ram-policy/
- https://help.aliyun.com/zh/oss/user-guide/access-control-base-on-ram-policy

## 推荐 RAM Policy

给当前生产 app / worker 使用的 RAM 主体追加自定义 policy：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:DeleteObject",
        "oss:AbortMultipartUpload"
      ],
      "Resource": [
        "acs:oss:*:*:jingjing-domestic-phase1-hz/merchant-media/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:jingjing-domestic-phase1-hz"
      ],
      "Condition": {
        "StringLike": {
          "oss:Prefix": [
            "merchant-media/*"
          ]
        }
      }
    }
  ]
}
```

如果后续切片 worker 需要 multipart upload，这里的 `oss:PutObject` 与 `oss:AbortMultipartUpload` 应保留。当前不需要扩大到全 bucket。

## 权限修复后的 smoke test

不要直接迁移数据。先在服务器上做最小读写删除测试：

```bash
cd /srv/jingjing-domestic/current/app
sudo bash -lc '
set -a
source /srv/jingjing-domestic/shared/env/app.env
set +a
node --input-type=module <<'"'"'NODE'"'"'
import fs from "node:fs";
import OSS from "ali-oss";

const key = `merchant-media/a8df8d8a-38f2-49b0-bda7-40c48d3537cf/_policy_smoke/${Date.now()}.txt`;
const file = "/tmp/merchant-media-policy-smoke.txt";
fs.writeFileSync(file, "merchant-media policy smoke\n");

const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  endpoint: process.env.ALIYUN_OSS_ENDPOINT,
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
  timeout: 120000
});

await client.put(key, file);
await client.head(key);
await client.delete(key);
console.log(JSON.stringify({ ok: true, key }, null, 2));
NODE
'
```

验收标准：

```json
{
  "ok": true
}
```

## 当前 94 条素材迁移方案

权限修复后，`shaokao@163.com` 当前 94 条 legacy 视频素材可以迁到新表。推荐步骤：

1. 读取当前导入 manifest：
   - `/srv/jingjing-domestic/imports/bbq-media-20260526/manifest.json`
2. 上传原视频到：
   - `merchant-media/<merchantId>/originals/<assetId>/source.mp4`
3. 上传缩略图到：
   - `merchant-media/<merchantId>/thumbs/<assetId>/<clipId>.jpg`
4. 写入：
   - `merchant_media_assets`
   - `merchant_media_clips`
5. 验证：
   - `merchant_media_assets = 94`
   - `merchant_media_clips = 94`
   - private media search 可返回下载 URL
6. 把当前 legacy 94 条从实际检索池退出：
   - 推荐先把 `source_items.structure_summary.materialStatus` 改成 `archived`
   - 不建议立刻删除 legacy DB/OSS，先保留回滚窗口

不要在迁移后同时保留 legacy ready 和 merchant_media ready，否则 private media 搜索可能出现重复素材，因为两套 storage key 不同，当前 dedupe 只按 `bucketName + storageKey + mediaType` 去重。

## 隐形问题清单

### 1. 正常上传不会自动进入新 clip 库

当前商家端项目媒体上传视频时，会创建 `source_items`，视频状态默认是 `parsing`。因为自动打标 / 自动切片 / 缩略图 worker 还没实现，它不会自动变成 `merchant_media_clips`。

影响：

- 用户上传视频后看到“识别中”是符合当前代码状态的。
- 补 OSS 权限只能解决 `merchant-media/` 可写，不能自动补齐打标和切片能力。

### 2. 新库与旧库重复检索

当前 private media repository 会合并：

- `merchant_media_clips`
- legacy `source_items + asset_objects`

如果迁移后不 archive legacy，搜索结果可能重复。

### 3. legacy 路径没有独立缩略图

本次 94 条素材虽然本地生成了 thumbnail，但 legacy 检索映射当前 `thumbStorageKey = null`。视频搜索和下载可用，但如果某个前端视图强依赖独立缩略图，会不如新表完整。

### 4. 生产 endpoint 分内外网

批量服务器上传使用 `oss-cn-hangzhou-internal.aliyuncs.com` 速度明显更好。但浏览器直传不能用内网 endpoint。

后续如果要优化，应区分：

- 浏览器上传 endpoint：公网 OSS endpoint
- 服务器/worker 上传 endpoint：内网 OSS endpoint

不要简单把全局 `ALIYUN_OSS_ENDPOINT` 改成 internal，否则用户浏览器可能无法上传。

### 5. 权限检查不在 release gate 里

当前 health check 只验证 OSS 已配置，不验证关键前缀可写。后续 release gate 应补：

- `source-assets/` put/head/delete
- `draft-inputs/` put/head/delete
- `video-results/` put/head/delete
- `merchant-media/` put/head/delete

### 6. 新表路径现在依赖外部处理链路

`merchant_media_*` 不是单纯“上传原视频”就完整。理想数据需要：

- 原始视频 key
- clip key 或 full video key
- thumb key
- width / height / duration
- orientation
- tags
- description
- tag_source / tag_confidence

所以权限修复后，仍然需要一个 manifest 或 worker 负责写完整数据合同。

## 推荐执行顺序

1. 先由有阿里云 RAM 权限的人给当前生产 RAM 主体补 `merchant-media/*` policy。
2. 在服务器执行 smoke test。
3. smoke test 通过后，迁移 `shaokao@163.com` 当前 94 条素材到 `merchant_media_*`。
4. 迁移验证通过后，将 legacy 94 条标记为 `archived`，避免重复检索。
5. 增加一个可复用权限检查脚本或 release gate，防止下次部署后才发现前缀不可写。

## 当前不建议做的事

- 不要改 bucket ACL 为 public。
- 不要给全桶 `AliyunOSSFullAccess`。
- 不要直接删除当前 94 条 legacy 素材。
- 不要把全局 OSS endpoint 改成 internal，除非同时拆出浏览器上传公网 endpoint。
- 不要在自动打标 / 切片 worker 未实现前，假设正常上传视频会自动进入 `merchant_media_clips`。
