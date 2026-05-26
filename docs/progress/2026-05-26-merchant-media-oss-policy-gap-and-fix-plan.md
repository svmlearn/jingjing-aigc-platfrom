# 2026-05-26 merchant-media OSS 权限缺口与新视频素材库收口方案

## 当前判断

结论：`merchant-media/` 前缀写入失败不是因为本次手动导入“没走正常上传流程”才产生的单点问题，而是生产 OSS/RAM policy 没有覆盖新视频素材 clip 库前缀。

这份记录要同时服务两个目的：

1. 让下一位接手者知道本次为什么改、改了哪里、验证了什么。
2. 如果未来素材检索、OSS 写入或 `shaokao@163.com` 视频库突然异常，可以从这里快速判断是权限、数据迁移、代码 release，还是后续自动打标/切片链路引入的新问题。

## 快速排查摘要

未来如果出现相似问题，先按这个顺序定位：

1. `merchant-media/*` 写入失败、OSS 报 `AccessDenied`：
   - 先查 RAM 策略 `jingjing-domestic-phase1-oss-prefix-policy` 当前默认版本是否仍包含 `acs:oss:*:*:jingjing-domestic-phase1-hz/merchant-media/*`。
   - 再在服务器用生产 env 做 `put/head/delete` smoke。
2. 私有素材接口返回 0 或少于预期：
   - 查 `merchant_media_clips where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf' and status = 'ready'`。
   - 当前正确值是 94。
3. 私有素材接口 500，错误含 `localeCompare`：
   - 说明运行代码没有包含 `f4d5542` 的 `createdAt` ISO string 修复，检查 `current` release。
4. 搜索结果重复：
   - 查 legacy `source_items.structure_summary->>'materialStatus'` 是否被恢复成 `ready`。
   - 当前正确状态是 legacy 94 条均为 `archived`。
5. 用户正常上传后仍显示“识别中”：
   - 这不是本次权限问题。本次没有实现自动打标/切片/缩略图 worker，普通上传仍可能停留在 `source_items` 的待识别状态。

## 2026-05-26 执行结果

已完成：

- 确认生产 `ALIYUN_OSS_ACCESS_KEY_ID` 对应 RAM 用户为 `jingjing-domestic-oss-phase1`。
- 在既有自定义策略 `jingjing-domestic-phase1-oss-prefix-policy` 上新增默认版本 `v3`。
- `v3` 在原有 `app-storage-provider-smoke/*`、`source-assets/*`、`draft-inputs/*`、`knowledge/*`、`video-results/*` 基础上追加：
  - `acs:oss:*:*:jingjing-domestic-phase1-hz/merchant-media/*`
- 服务器 smoke test 通过：
  - `merchant-media/<merchantId>/_policy_smoke/...txt`
  - `put/head/delete = ok`
- `shaokao@163.com` 当前 94 条烧烤视频素材已迁入新 clip 库：
  - `merchant_media_assets = 94`
  - `merchant_media_ready_video_clips = 94`
  - `ready_source_asset_items = 0`
  - `archived_source_asset_items = 94`
- OSS 抽样校验通过：
  - 抽查 3 个 clip，对应 3 个视频对象 + 3 个缩略图对象，`head = ok`

本次实际没有新建独立 RAM policy，而是更新现有前缀策略。原因是生产 RAM 用户原本就只挂了一个 OSS 前缀策略，把 `merchant-media/*` 合入同一策略比再散一个策略更容易审计。

迁移备份与脚本位置：

- 服务器备份：`/srv/jingjing-domestic/backups/shaokao-bbq-merchant-media-migration-20260526T2345`
- 服务器一次性脚本：`/srv/jingjing-domestic/imports/bbq-media-20260526/migrate-shaokao-bbq-source-assets-to-merchant-media.mjs`
- 仓库脚本：`app/scripts/migrate-shaokao-bbq-source-assets-to-merchant-media.mjs`

迁移中额外暴露并修复的代码问题：

- `merchant_media_clips.created_at` 从 PostgreSQL 读出时可能是 `Date`，但 private media 搜索排序调用了 `createdAt.localeCompare`。
- 已把新表 mapper 的 `createdAt` 统一转成 ISO string，避免接口返回 `500: t.clip.createdAt.localeCompare is not a function`。
- 修改文件：`app/src/lib/db/merchant-media-repository.ts`

迁移过程中的半成功状态和处理方式：

- 第一次 apply 已成功上传 94 个原视频和 94 个缩略图，也成功 upsert 94 条 `merchant_media_assets` 和 94 条 `merchant_media_clips`。
- 但脚本最后一步归档 legacy `source_items` 时，SQL `jsonb_build_object('migrationBatch', $4, ...)` 缺少 `$4::text` 显式 cast，PostgreSQL 报：
  - `code=42P18 could not determine data type of parameter $4`
- 这次失败发生在上传和新表写入之后、legacy 归档之前，所以当时的中间状态是：
  - 新表已经 ready 94
  - legacy 仍 ready 94
  - 如果停在这里，private media 会有重复候选风险
- 已修脚本：
  - 给 `$4` 加 `$4::text`
  - 增加 `--skip-upload`，允许在对象已经上传后只补 DB upsert + legacy archive
- 第二次 apply 使用 `--skip-upload` 补跑，最终归档 94 条 legacy，最终状态正确。

服务器 release：

- 本地 commit：`f4d5542 fix: stabilize merchant media migration search`
- 新 release：`/srv/jingjing-domestic/releases/20260526234730-f4d5542`
- `current`：`/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526234730-f4d5542`
- `jingjing-domestic-app.service`：`active`
- 其他服务状态：`jingjing-content-generation-worker.service`、`jingjing-firered-openstoryline.service`、`jingjing-openstoryline-engine.service`、`jingjing-video-worker.service` 均为 `active`

release 后验证：

```json
{
  "health": {
    "ok": true,
    "database": "postgres",
    "storage": "aliyun_oss"
  },
  "privateMediaAll": {
    "total_results": 94,
    "returned": 5,
    "first_link_is_private": true
  },
  "privateMediaQuery_烤串": {
    "total_results": 57,
    "returned": 5,
    "first_link_is_private": true
  }
}
```

本地验证：

- `node --check app/scripts/migrate-shaokao-bbq-source-assets-to-merchant-media.mjs`：通过
- `cd app && node --test src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs`：11 项通过
- `cd app && pnpm typecheck`：通过
- `cd app && node --test src/lib/private-media-pexels-adapter.test.ts src/lib/private-media-workflow-fixture.test.ts ...`：项目当前未配置直接执行 `.ts` 测试的 loader，失败于 `ERR_UNKNOWN_FILE_EXTENSION`，不是业务断言失败

## 当前最终状态

截至本记录完成时，生产最终状态是：

| 项 | 正确值 |
| --- | --- |
| RAM 用户 | `jingjing-domestic-oss-phase1` |
| RAM policy | `jingjing-domestic-phase1-oss-prefix-policy` |
| RAM policy 默认版本 | `v3` |
| OSS bucket | `jingjing-domestic-phase1-hz` |
| 新素材前缀 | `merchant-media/` 已可 `put/head/delete` |
| `shaokao@163.com` merchant_id | `a8df8d8a-38f2-49b0-bda7-40c48d3537cf` |
| `merchant_media_assets` | 94 |
| `merchant_media_clips` ready video | 94 |
| legacy `source-assets` ready | 0 |
| legacy `source-assets` archived | 94 |
| 私有视频接口全量 | `total_results = 94` |
| 私有视频接口 `query=烤串` | `total_results = 57` |
| 当前服务器 release | `/srv/jingjing-domestic/releases/20260526234730-f4d5542` |
| release 验证记录 commit | `e165bee docs: record merchant media release verification` |

当前系统存在两套尚未完全收口的媒体路径：

| 路径 | 当前用途 | OSS 前缀 | 当前生产权限 | 状态 |
| --- | --- | --- | --- | --- |
| 素材库 / 普通项目媒体上传 | `source_items + asset_objects` | `source-assets/<merchantId>/<sourceItemId>/...` | 可写 | 当前正常上传使用 |
| 新视频素材 clip 库 | `merchant_media_assets + merchant_media_clips` | `merchant-media/<merchantId>/{originals,clips,thumbs}/...` | 可写，已修复 | `shaokao@163.com` 94 条已迁入 |

因此：

- 普通商家端上传视频本身原本不会因为 `merchant-media/` 权限失败，因为它当前生成的是 `source-assets/` key。
- 修复前，任何后续流程只要要进入新视频素材 clip 库，即写 `merchant-media/`，都会遇到同一个 `AccessDenied`。
- 修复后，`merchant-media/` 前缀已可写，但普通上传仍不会自动进入新 clip 库，因为自动打标/切片/缩略图 worker 尚未实现。
- 本次手动导入只是提前暴露了这个基础设施缺口，并顺手把 `shaokao@163.com` 这批素材迁到了新表。

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

## 修复前生产验证事实

已验证当前生产 OSS 凭证：

- `source-assets/`：可写。
- `draft-inputs/`：可写。
- `video-results/`：可写。
- `merchant-media/`：写入失败，OSS 返回 `AccessDenied`。

本次 `shaokao@163.com` 导入在权限修复前曾临时采用 legacy 兼容路径：

- `ready_legacy_video_assets = 94`
- `merchant_media_assets = 0`
- `merchant_media_clips = 0`

这不是最终理想态，只是为了在 RAM policy 未修复前先让 video-worker/private media 兼容检索可读到素材。权限修复后，这 94 条已迁到 `merchant_media_*`，legacy 记录已从检索池归档退出。

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

## 实际执行命令口径

本次实际迁移脚本使用生产 env，且服务端批量上传临时切到内网 OSS endpoint：

```bash
cd /srv/jingjing-domestic/imports/bbq-media-20260526
set -a
source /srv/jingjing-domestic/shared/env/app.env
set +a
export ALIYUN_OSS_ENDPOINT="${ALIYUN_OSS_INTERNAL_ENDPOINT:-oss-cn-hangzhou-internal.aliyuncs.com}"

node ./migrate-shaokao-bbq-source-assets-to-merchant-media.mjs \
  --manifest /srv/jingjing-domestic/imports/bbq-media-20260526/manifest.json \
  --videos-dir /srv/jingjing-domestic/imports/bbq-media-20260526/videos \
  --thumbs-dir /srv/jingjing-domestic/imports/bbq-media-20260526/thumbs \
  --backup-dir /srv/jingjing-domestic/backups/shaokao-bbq-merchant-media-migration-20260526T2345 \
  --archive-source-assets \
  --apply
```

第一次执行已完成上传和新表写入，但归档阶段因 `$4` 类型推断失败中断。补跑时使用：

```bash
node ./migrate-shaokao-bbq-source-assets-to-merchant-media.mjs \
  --manifest /srv/jingjing-domestic/imports/bbq-media-20260526/manifest.json \
  --videos-dir /srv/jingjing-domestic/imports/bbq-media-20260526/videos \
  --thumbs-dir /srv/jingjing-domestic/imports/bbq-media-20260526/thumbs \
  --backup-dir /srv/jingjing-domestic/backups/shaokao-bbq-merchant-media-migration-20260526T2345 \
  --archive-source-assets \
  --skip-upload \
  --apply
```

`--skip-upload` 是为了避免在对象已上传成功后重复传 4GB 级视频文件。这个参数只适合对象已确认上传过、需要补 DB upsert/legacy archive 的场景。

## 恢复与回滚手册

### 1. 如果新 release 代码有问题

本次 release 前一个版本：

```text
/srv/jingjing-domestic/releases/20260526221928-7620bf0
```

可回滚 app symlink：

```bash
sudo ln -sfn /srv/jingjing-domestic/releases/20260526221928-7620bf0 /srv/jingjing-domestic/current
sudo systemctl restart jingjing-domestic-app.service
curl -fsS http://127.0.0.1:3000/api/health
```

注意：如果回滚到 `7620bf0`，`merchant_media_clips.created_at` 的 `Date -> string` mapper 修复会消失，private media 搜索可能再次出现 `localeCompare is not a function`。所以代码回滚只适合排查其他 release 问题，不适合作为长期状态。

### 2. 如果新表素材需要临时退出检索

不要先删 OSS。更安全的是把 `merchant_media_clips.status` 改成 `archived`，并把 legacy 恢复成 `ready`。

回滚到 legacy 检索池的 SQL 方向：

```sql
begin;

update public.merchant_media_clips
set status = 'archived'
where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf'
  and media_type = 'video'
  and status = 'ready';

update public.merchant_media_assets
set status = 'archived'
where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf'
  and media_type = 'video'
  and status = 'ready';

update public.source_items
set structure_summary = jsonb_set(
      coalesce(structure_summary, '{}'::jsonb),
      '{materialStatus}',
      '"ready"'::jsonb,
      true
    ),
    trace_payload = jsonb_set(
      coalesce(trace_payload, '{}'::jsonb),
      '{status}',
      '"ready"'::jsonb,
      true
    )
where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf'
  and trace_payload->>'importBatch' = 'manual-bbq-media-source-assets-20260526'
  and coalesce(structure_summary->>'materialStatus', 'ready') = 'archived';

commit;
```

恢复后应重新查：

```sql
select count(*) from public.merchant_media_clips
where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf'
  and status = 'ready';

select coalesce(structure_summary->>'materialStatus', 'ready'), count(*)
from public.source_items
where merchant_id = 'a8df8d8a-38f2-49b0-bda7-40c48d3537cf'
  and trace_payload->>'importBatch' = 'manual-bbq-media-source-assets-20260526'
group by 1;
```

### 3. 如果怀疑 OSS 对象不完整

先抽样 `head`，不要立刻重传全部：

```bash
cd /srv/jingjing-domestic/current/app
sudo bash -lc '
set -a
source /srv/jingjing-domestic/shared/env/app.env
set +a
node --input-type=module <<'"'"'NODE'"'"'
import OSS from "ali-oss";
import pg from "pg";

const merchantId = "a8df8d8a-38f2-49b0-bda7-40c48d3537cf";
const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const oss = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  endpoint: String(process.env.ALIYUN_OSS_INTERNAL_ENDPOINT || process.env.ALIYUN_OSS_ENDPOINT).replace(/^https?:\/\//i, ""),
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true
});

const { rows } = await pool.query(`
  select storage_key, thumb_storage_key
  from public.merchant_media_clips
  where merchant_id = $1 and status = 'ready'
  order by created_at asc
  limit 3
`, [merchantId]);

for (const row of rows) {
  await oss.head(row.storage_key);
  await oss.head(row.thumb_storage_key);
}

await pool.end();
console.log(JSON.stringify({ ok: true, checkedObjects: rows.length * 2 }, null, 2));
NODE
'
```

### 4. 如果要回滚 RAM policy

正常不建议回滚 RAM policy，因为 `merchant-media/*` 是后续新视频素材库的正式前缀。除非确认出现安全事故，否则不要把默认版本切回 `v2`。

如果必须回滚：

- 阿里云控制台：RAM 访问控制 -> 权限策略 -> `jingjing-domestic-phase1-oss-prefix-policy` -> 版本管理 -> 把 `v2` 设为默认。
- 回滚后新 clip 库写入会再次失败，任何导入/自动打标/切片流程都可能报 `AccessDenied`。

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

## 本次执行顺序与后续复用

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
