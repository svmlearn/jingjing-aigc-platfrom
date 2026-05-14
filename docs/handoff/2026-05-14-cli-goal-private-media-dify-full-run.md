# 2026-05-14 CLI Goal：Dify 脚本制作 + 私有素材库 + 个人克隆声音全量跑完任务书

## 0. 使用方式

本文件给 Codex CLI 的 goal 模式使用。目标是一次性跑完整个闭环，但必须按阶段硬门禁推进。

建议在 CLI goal 中直接引用本文件：

```text
Use docs/handoff/2026-05-14-cli-goal-private-media-dify-full-run.md as the source goal.
Continue until every Completion Gate in the file passes.
Do not stop at a proposal. Implement, test, document, and leave handoff.
```

## 1. 总 Goal

实现最小可验收闭环：

```text
内容日历 / 团队成员任务
-> content-generation-worker 调 Dify
-> 解析 outputs.final_result_json
-> article.* 落图文 variant
-> video.* 落 video_script variant
-> quality.* 做质量 gate
-> 商家端素材进入 merchant 私有素材库
-> 素材切片 / 打标签 / 入库
-> Pexels-compatible 私有检索接口返回 60 天下载 URL
-> 视频工作台确认 video_script
-> video_edit_jobs.input_payload 合同化
-> video worker / OpenStoryline 使用私有素材和个人克隆声音出片
-> 个人克隆声音支持每人一个当前音色，重新录制覆盖，失败保旧
```

## 2. 真相源

必须先读：

- `AGENTS.md`
- `docs/README.md`
- `docs/架构规范/2026-04-28-current-architecture.md`
- `docs/progress/2026-04-25-supabase-migration-current-state.md`
- `docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
- `docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-Dify最终JSON字段确认器.html`
- `docs/架构规范/2026-05-14-COS私有素材库与个人克隆声音工作方案.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/01-依据与全局硬门禁.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/02-COS存储上传与权限.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/03-商家团队素材库与标签.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/04-Pexels兼容检索接口.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/05-个人克隆声音与覆盖.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/06-Worker与OpenStoryline合同.md`
- `docs/架构规范/private-media-voice-plan-2026-05-14/07-测试验收纠错与上线.md`

## 3. 全局硬边界

- Dify 是当前真正的脚本制作 / 单条内容生成链路。
- Dify 最终 JSON 字段以 `2026-05-13-Dify最终JSON字段确认器.html` 为准，主合同是 `article.*`、`video.*`、`quality.*`、`debug.*`。
- 不引入另一套“脚本制作 Agent 原生 JSON”作为主合同。
- `outputs.final_result_json` 不得直接作为 `video_edit_jobs.input_payload`。
- `article.*` 落图文 variant。
- `video.*` 落 `video_script` variant。
- `quality.*` 控制 `passed / needs_review / blocked`。
- `debug.*`、`workflowVersion` 只进 trace / metadata。
- 团队素材按 `merchant_id` 隔离。
- 个人克隆声音按 `created_by_user_id` 私有。
- 用户端 / 成员端临时上传素材不进入 `merchant_media_*`，不长期保存，不切片打标签。
- COS 不当数据库；索引、权限、标签、状态和检索都在 DB / 服务端。
- 下载 URL 给 OpenStoryline / 前端素材预览时必须 60 天有效，但不能是永久 public bucket URL。
- Pexels-compatible 响应只模仿 Pexels 请求 / 响应外壳，内部标签体系不暴露给 OpenStoryline。
- 每个阶段必须有测试和 progress 记录。
- 不 push、不 merge，除非用户另行明确要求。

## 4. 推荐执行顺序

### 阶段 A：Dify final_result_json 落库

目标：

- 新增或补齐 `content_generation_batches` / `content_generation_jobs` 或等价实现。
- content-generation-worker 能调 Dify 或以 fixture 模拟 Dify。
- 解析 `outputs.final_result_json`。
- 按字段确认器 schema 校验：
  - `workflowVersion`
  - `status`
  - `article.title`
  - `article.coverCopy`
  - `article.images[].cosPath`
  - `article.images[].role`
  - `article.copyText`
  - `video.storyOutline`
  - `video.estimatedDuration`
  - `video.scenes[]`
  - `quality.status`
  - `quality.pass`
  - `quality.blockingReasons`
  - `quality.missingInputs`
- 成功时创建一个 draft，下挂 `note` 和 `video_script` 两个 variant。
- `quality.status = blocked` 或关键字段缺失时，不得创建可投产视频任务。

硬门禁：

- 不把 Dify 总包直接写入 `video_edit_jobs.input_payload`。
- `video_script` variant payload 以 Dify `video.*` 为主。
- 原始 Dify 包可保存在 job `output_json`，但前台和视频工作台消费 variant payload。

测试：

- 正常 Dify fixture：生成 note + video_script。
- 缺 `video.scenes[]`：进入 `schema_failed` / `needs_review`。
- `quality.status = blocked`：不允许创建视频任务。
- 重复 workflow run / job：幂等，不重复创建有效 variant。

### 阶段 B：商家团队私有素材库 schema

目标：

- 新增 `merchant_media_assets`。
- 新增 `merchant_media_clips`。
- RLS / service role 访问边界明确。
- 所有素材记录直接带 `merchant_id`。
- 必要索引齐全。

硬门禁：

- repository 查询必须显式带 `merchant_id`。
- 不只靠 RLS 过滤。
- 不能有 `team_id` 作为主隔离字段。
- 用户端临时素材不得进入 `merchant_media_*`。

测试：

- 商家 A 不能读商家 B 素材。
- 用户端临时素材不会产生 `merchant_media_assets` / `merchant_media_clips`。
- ready asset 必须至少有一个 ready clip。

### 阶段 C：COS 上传、校验、60 天下载 URL

目标：

- 商家端入库素材走 upload intent。
- 服务端生成 COS key。
- 前端只拿临时上传凭证，不拿永久密钥。
- complete 后做真实类型校验，图片 / 视频 / 音频不能只信前端 MIME。
- 下载给 60 天有效 URL。

硬门禁：

- 60 天 URL 可以是平台下载 token URL，也可以是服务端永久密钥签出的受限 COS URL。
- 不能使用前端临时密钥强行签 60 天 URL。
- 素材 archived / quarantined / missing_object 后，即使 URL 未过期，平台下载入口也必须拦截。
- COS bucket 不能 public。

测试：

- 错 bucket、错 prefix、跨 owner complete 失败。
- 伪造 MIME 上传会被 post-upload validation 拦截。
- 60 天 URL 生成后可访问。
- 下架 / quarantine 后 60 天 URL 被拒绝。

### 阶段 D：商家素材切片与标签

目标：

- 商家端确认入库素材切片。
- 生成缩略图。
- 提取真实宽高、时长、方向。
- 生成内部标签：
  - `description`
  - `tags`
  - `industry_tags`
  - `scene_tags`
  - `shot_tags`
  - `people_tags`
  - `quality_tags`
  - `tag_confidence`
  - `tag_source`
- 低置信度进入 `needs_review` / `needs_retag`。

硬门禁：

- 宽高、时长、方向来自媒体解析，不由 LLM 猜。
- 标签只做内部召回，不要求进入 Pexels response。
- `tagging_failed` 不参与自动召回。

测试：

- 上传 3-10 个素材可生成 ready clips。
- ready clip 有 COS 对象、缩略图、元数据、标签。
- 标签召回可解释命中原因。

### 阶段 E：Pexels-compatible 私有检索接口

目标：

- 图片接口：

```text
GET /api/private-media/pexels/v1/search
```

- 视频接口：

```text
GET /api/private-media/pexels/videos/search
```

- 返回 Pexels-like JSON：
  - `photos[].src.*`
  - `videos[].video_files[].link`
  - `page`
  - `per_page`
  - `total_results`
  - `next_page`
- `link/src` 是 60 天有效下载 URL。

硬门禁：

- 只返回当前 `merchant_id` ready 素材。
- repository 查询显式带 `merchant_id`。
- `per_page` 有上限。
- 生产响应不暴露 `merchant_id`、COS key、bucket、内部 tags。
- query 为空只返回当前商家精选 / 最近素材，不跨商家兜底。

测试：

- 视频 fixture 满足 OpenStoryline 当前字段。
- 图片 fixture 满足 OpenStoryline 当前字段。
- 连续翻页无重复。
- URL 过期 / 下架行为明确。
- B 商家查不到 A 商家素材。

### 阶段 F：个人克隆声音覆盖

目标：

- 每个 `merchant_id + created_by_user_id` 只有一个当前可用 voice profile。
- 首次录音创建 voice profile。
- 重新录制走 pending。
- 新音频校验 + provider 成功后再 swap。
- 失败保留旧音色。
- 覆盖成功后旧 audio / COS / provider voice 进入 cleanup job。

硬门禁：

- `created_by_user_id` 是个人声音主边界。
- team member 不能默认使用 owner 的声音。
- 覆盖操作幂等。
- 同一用户不能多个 ready 当前音色。

测试：

- 首次录音成功。
- 覆盖成功后只有一个当前音色。
- provider 失败时旧音色可继续创建视频任务。
- 用户 A 不能用用户 B voice profile。

### 阶段 G：视频工作台到 video worker / OpenStoryline

目标：

- `video_script` variant 经成员端确认后创建 `video_edit_jobs`。
- `video_edit_jobs.input_payload` 合同化。
- payload 支持：
  - Dify `video.*` 生成的脚本。
  - 私有素材检索 / input assets。
  - `voice_profile` 模式。
- video worker 能校验 payload。
- OpenStoryline 使用 Pexels-compatible base URL 检索素材。
- 使用 60 天 URL 下载私有素材。
- 使用个人克隆声音生成 voiceover。

硬门禁：

- `video_edit_jobs.input_payload` 不接收 Dify 原始总包。
- `script.locked = true`。
- `voice_profile` 模式必须有 `voice_profile_id`、`ref_audio_asset_id`、`ref_audio_asset`。
- `voiceover_artifacts` 缺失时克隆声音 job 不算完全通过。

测试：

- system voiceover job。
- voice_profile job。
- 私有素材检索 job。
- OpenStoryline 不配置真实 Pexels key 也能检索私有素材。
- 所有失败能定位到 download / voice_ref / provider / openstoryline / upload / persistence。

## 5. 最终 Completion Gate

只有同时满足以下条件，才算完成：

- Dify final JSON fixture 通过 schema gate，并落 note + video_script variants。
- 商家素材库 schema、RLS、索引、repository 显式过滤通过。
- COS 上传、post-upload validation、60 天下载 URL、下架拦截通过。
- 商家素材切片、缩略图、标签、低置信度复核通过。
- Pexels-compatible 图片 / 视频接口通过 fixture 和跨商家测试。
- 个人克隆声音首次录制、覆盖成功、覆盖失败保旧、跨用户拒绝通过。
- video worker 能消费确认后的 `video_script` variant 创建的 job。
- OpenStoryline 能通过私有 Pexels-compatible 接口下载素材。
- doctor / 等价检查无阻断项：
  - 无跨租户泄漏。
  - 无 public bucket。
  - 无 service role 泄漏到客户端。
  - 无过期 pending 积压。
  - 无多 ready voice profile。
- 所有新增能力至少有单测或 fixture 验证。
- 写入 `docs/progress/YYYY-MM-DD-*.md`，记录做了什么、跑了什么、没跑通什么。
- 写入 `docs/handoff/YYYY-MM-DD-*.md`，记录改动文件、验证结果、分支 / worktree、是否 push / merge。

## 6. 建议验证命令

根据实际代码选择最小验证，至少包括：

```powershell
cd app
pnpm test
pnpm lint
pnpm build
```

```powershell
cd workers/video-worker
python -m pytest
```

如果仓库没有统一 test 命令，就运行相关新增测试文件，并在 progress 中说明缺口。

## 7. 中断和阻塞规则

可以标记外部阻塞：

- 缺 Dify API key。
- 缺 COS 真实 bucket / CAM 权限。
- 缺 Supabase service role / staging DB 权限。
- 缺 voice clone provider key。
- OpenStoryline 服务不可用且本地无法启动。

不能把以下情况当外部阻塞：

- 测试失败。
- 类型错误。
- schema 未对齐。
- 文档未更新。
- UI 没接好。
- worker 合同不匹配。

这些都必须继续修。

## 8. 禁止事项

- 不直接把 Dify 原始 `outputs.final_result_json` 塞进 `video_edit_jobs.input_payload`。
- 不用 public COS bucket 解决下载问题。
- 不返回永久公开 COS URL。
- 不把成员端临时上传素材写入团队素材库。
- 不把个人 voice profile 做成团队共享资产。
- 不只靠 RLS，不在 repository 中省略 `merchant_id` / `created_by_user_id`。
- 不跳过测试直接写“完成”。
- 不 push / 不 merge，除非用户明确要求。
