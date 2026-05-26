# 2026-05-26 视频素材处理：手动打标签

## 1. 本轮目标

为烧烤店测试场景整理一批可用于后续 `video-worker` 检索、剪辑和生成的视频素材元数据。

本轮只做本地素材处理、人工+AI 打标签、结构校验和归档，不做服务器 release，不做数据库写入，不做 OSS 上传。

目标商家账号记录为：

- `shaokao@163.com`

## 2. 输入来源

素材来源：

- 主要来源：VJshi 搜索页「饮食烧烤」
- 本地素材目录：`/Users/wy/Downloads/烧烤素材候选_100_20260526`
- 本地打标产物源目录：`/Users/wy/Downloads/烧烤素材候选_100_20260526/metadata/local_tagging_v2`

参考标准：

- `docs/架构规范/2026-05-26-素材标签与检索路由打法.md`
- `docs/架构规范/2026-05-26-商家视频素材切分与标签数据标准.md`
- `/Users/wy/Downloads/metadata/metadata`
- `/Users/wy/Downloads/sql`

## 3. 本轮归档产物

本目录已复制一份本地打标产物，作为后续接手、复核、导入前处理的固定记录：

- `README.md`：本地打标包说明
- `bbq_merchant_media_assets.json`：素材资产级元数据
- `bbq_merchant_media_assets.jsonl`：素材资产级 JSONL
- `bbq_merchant_media_clips.json`：整条视频 clip 级元数据
- `bbq_merchant_media_clips.jsonl`：整条视频 clip 级 JSONL
- `bbq_segment_plan.json`：建议切分计划
- `bbq_tag_review.csv`：人工复核表
- `bbq_validation.json`：结构校验结果

注意：本目录只归档元数据文件，没有复制视频大文件。

## 4. 处理结论

本轮保留并打标：

- 素材资产：94 条
- 整条视频 clip：94 条
- 建议切分素材：43 条
- 建议切分片段：183 段
- 可作为整条视频素材入库的 clip：94 条
- 可直接作为切分片段入库的 clip：0 条
- 弱相关素材：11 条
- 需要人工复核素材：46 条

角色标签分布：

- `role:bbq_skewer_closeup`：24
- `role:bbq_night_market`：18
- `role:bbq_whole_meat_roast`：14
- `role:bbq_food_closeup`：10
- `role:bbq_seafood_grill`：7
- `role:bbq_grill_fire`：6
- `role:bbq_staff_preparation`：6
- `role:bbq_customer_eating`：5
- `role:bbq_dining_table`：4

镜头标签分布：

- `lens:menu_showcase`：37
- `lens:detail_proof`：17
- `lens:atmosphere_context`：17
- `lens:process_detail`：11
- `lens:social_proof`：5
- `lens:transition_detail`：5
- `lens:opening_context`：2

## 5. 审查记录

本轮使用 subagent 完成本地打标包生成，主线程做复核。

第一次复核发现一类真实问题：部分 `role` / `lens` 标签被写成了带空格的形式，例如 `role:bbq food closeup`、`lens:menu showcase`。这会破坏后续结构化检索和 SQL/JSON 查询的一致性。

已要求 subagent 返工修正，修正后复核通过：

- 所有 `role:*` / `lens:*` 标签改为 snake_case
- JSON / JSONL / CSV 数量对齐
- `readySegments = 0`，切分片段仍保持计划态
- `customerRoleRisk = 0`
- 未发现阻塞性结构错误

最终校验摘要：

```text
ok: true
readyForDbImport: false
merchantAssetCount: 94
merchantClipCount: 94
segmentPlanAssetCount: 43
segmentPlanSegmentCount: 183
readyFullVideoClipCount: 94
readySegmentClipCount: 0
weakRelevanceCount: 11
needsReviewCount: 46
```

## 6. 当前不能直接入库的原因

`bbq_validation.json` 明确标记：

```text
readyForDbImport: false
```

原因不是标签结构失败，而是导入前置条件尚未完成：

- `bucketName` 仍是 `REPLACE_WITH_BUCKET` 占位符
- `merchantId` / `uploadedByUserId` 仍是占位 UUID
- 还没有执行对象存储上传
- `thumbStorageKey` 只是计划值，缩略图对象尚未生成
- `bbq_segment_plan.json` 仍是切分计划，不能当作 ready segment clip 入库

因此，这批文件现在适合作为“导入前元数据包”和“人工复核依据”，不适合直接写生产库。

## 7. 服务器与账号卡点

目标账号已记录为：

- `shaokao@163.com`

但本轮尚未完成服务器上传或生产导入，原因：

- 用户明确要求不要做服务器 release
- 当前本地 `main` 不是服务器最新 release 分支状态
- Gitee `5.26-worker-fix` 还有最新代码未合并到本地 `main`
- 当前环境尝试连接 `meng@8.154.28.41` 时出现 `Permission denied (publickey)`
- 当前本地环境没有可直接用于生产导入的 PostgreSQL / OSS 凭据

结论：不能从当前环境安全执行服务器导入。下一步应先解决服务器访问和生产凭据问题，再按 `shaokao@163.com` 解析真实 `user_id` / `merchant_id`。

## 8. 下一步建议

1. 人工快速看一遍 `bbq_tag_review.csv`，优先确认 `needs_review = true` 的 46 条。
2. 确认是否保留 11 条弱相关素材；如果测试目标是“街边/大众烧烤店”，偏高端餐厅质感的素材应剔除或降权。
3. 确认切分策略：本轮只生成 `bbq_segment_plan.json`，没有真的切视频；后续可按 4-8 秒优先切菜单特写、烤制过程、氛围空镜、顾客吃喝等片段。
4. 服务器侧先只做导入脚本/数据准备，不做 release。
5. 导入前必须替换 bucket、storage key、merchant/user UUID，并确保视频和缩略图对象已上传到正确商家前缀。

## 9. 状态

状态：本地打标包已完成，已归档到 `docs/progress`，等待人工复核和服务器导入条件确认。

置信度：高。结构校验和主线程复核均通过；生产导入状态为未完成。
