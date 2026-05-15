# 2026-05-14 CLI Goal：Dify 脚本制作 + 私有素材库 + 个人克隆声音全量跑完任务书

## 0. 使用方式

本文件给 Codex CLI 的 goal 模式使用。目标是一次性跑完整个闭环，但必须按阶段硬门禁推进。

运行前优先在本机注入可用的服务端环境变量。不要把真实密钥写进本文档、提交到 git、贴进聊天记录或 progress / handoff。
Dify、Supabase API key、voice clone provider key 如当前没有真实参数，本轮 goal 不能因此停止；必须留接口、用 fixture / mock 跑通 schema、adapter、状态机、回退链路和测试。真实 Dify / provider 联调作为后续 smoke gate，不作为本轮 Completion Gate 的阻塞项。

建议在 CLI goal 中直接引用本文件：

```text
Use docs/handoff/2026-05-14-cli-goal-private-media-dify-full-run.md as the source goal.
Continue until every Completion Gate in the file passes.
Do not stop at a proposal. Implement, test, document, and leave handoff.
```

## 1. 总 Goal

实现最小可验收闭环。注意：Dify 是新内容生成 / 脚本制作主链路，现有视频脚本、测试草稿和 worker 传输合同是兼容辅路。Dify JSON 格式尚未完整落地到现有代码，因此所有实现必须通过融合 adapter / feature flag 渐进接入，不影响现有功能和传输合同。

```text
内容日历 / 团队成员任务
-> content-generation-worker 调 Dify
-> 解析 outputs.final_result_json
-> article.* 落图文 variant
-> video.* 落 video_script variant
-> quality.* 做质量 gate
-> Dify 主链路通过融合 adapter 映射成现有视频工作台可消费结构
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

## 2.1 本地环境参数注入

Goal 要跑真实 COS / Dify / DB / voice provider 时，必须由本地环境提供参数。推荐放在 `app/.env.local`，该文件已被 `.gitignore` 忽略。

必须配置的 COS 参数：

```dotenv
COS_SECRET_ID=...
COS_SECRET_KEY=...
COS_BUCKET=...
COS_REGION=...
COS_STS_DURATION_SECONDS=1800
COS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

说明：

- `COS_SECRET_ID` / `COS_SECRET_KEY` 是服务端永久密钥，只能留在本地 `.env.local`、部署平台 Secret 或 CI Secret，不得进入文档和日志。
- `COS_BUCKET` / `COS_REGION` 决定真实对象落点，必须和 staging / 目标环境一致。
- `COS_STS_DURATION_SECONDS` 只控制前端直传临时凭证有效期，不用于 60 天下载。
- `COS_READ_URL_TTL_SECONDS` 可保持短 TTL，用于平台内成片预览 app route 每次重签 COS。
- OpenStoryline / Pexels-compatible / 素材库外部预览的 60 天有效入口应由服务端 download token 或专门的 60 天签名逻辑实现，不能依赖前端 STS。

如果要跑真实外部链路，还需要按实际实现补齐：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DIFY_API_KEY=...
DIFY_WORKFLOW_ID=...
VOICE_CLONE_PROVIDER_API_KEY=...
TTS_PIXELLE_CLONE_BASE_URL=...
TTS_PIXELLE_CLONE_API_KEY=...
```

如当前代码使用的变量名不同，以代码中的 `process.env.*` / `os.getenv(...)` 为准，但不得把密钥硬编码进代码。
声音 provider 要按“能力”和部署环境判断，不要只按本机变量名前缀判断：当前代码里的 `pixelle_clone` 是 RunningHub clone 的适配名 / 历史命名，RunningHub 既可做普通 TTS，也可做声音克隆。真实 RunningHub clone key 以服务器 `/srv/jingjing-video-worker/.env` 为准；本机 `app/.env.local` 没有 `TTS_PIXELLE_CLONE_*` 不能判定缺真实克隆 key。goal 需要检查 `voice_profile` 是否正确进入 RunningHub clone 语义，而不能因为变量名前缀叫 `TTS_PIXELLE_CLONE_*` 就误判成另一个 provider。

本轮缺真实外部参数时的替代策略：

- Dify：实现 Dify client / adapter 接口，使用固定 `final_result_json` fixture 跑 schema gate、variant 落库、质量 gate、feature flag on/off 和现有辅路回退。
- Supabase API：如果没有 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，优先用现有 local repository / test double / migration SQL / repository 单测验证合同；真实 staging Supabase API 联调后置。
- 克隆声音 provider：真实 key 在服务器环境时，以服务器 `.env` 做 SET / EMPTY 预检；本机没有该 key 时，保留 provider interface，使用 mock RunningHub clone（代码适配名可继续叫 `pixelle_clone`）验证 pending -> provider success -> swap -> cleanup、provider failure 保旧、跨用户拒绝和 worker `voice_profile` payload；真实 RunningHub 克隆调用可在服务器侧 smoke。
- OpenStoryline / worker：在没有真实 provider key 时允许用 skeleton / mocked OpenStoryline response 验证 payload、下载合同、`voiceover_artifacts` 形状和错误分类；已有服务器普通 TTS / FireRed provider 可作为非阻塞 smoke。
- progress / handoff 必须明确记录哪些是真实 COS / worker 验证，哪些是 fixture / mock 验证，不能把 mock 写成真实外部联调。

安全预检命令，只输出 SET / EMPTY，不输出密钥值：

```powershell
cd app
$required = @(
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
  "COS_STS_DURATION_SECONDS",
  "COS_READ_URL_TTL_SECONDS",
  "MEDIA_UPLOAD_MAX_BYTES"
)
Get-Content .env.local | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2], "Process")
  }
}
$required | ForEach-Object {
  $value = [Environment]::GetEnvironmentVariable($_, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) { "$_=EMPTY" } else { "$_=SET" }
}
```

Goal 执行规则：

- 如果缺 COS 参数，不要把它当成代码失败；标记为“外部环境阻塞：缺 COS 参数”。
- 如果参数存在但上传 / 下载失败，不能直接说外部阻塞，必须继续检查 CAM 权限、bucket、region、key prefix、Content-Type / Content-Disposition 和签名 TTL。
- 任何日志、progress、handoff 只能记录变量名和 SET / EMPTY 状态，不能记录密钥值。

## 2.2 服务器环境入口和 COS 参数来源

当前已知真实部署环境入口：

```bash
ssh mdeploy@43.160.208.189
cd /srv/jingjing-video-worker
docker compose ps
```

说明：

- 该服务器用户已具备 `sudo`、`docker`、`jingjing-deploy` 组权限。
- 已验证能进入 `/srv/jingjing-video-worker`、读取 `.env`、写目录、执行 `docker compose ps`。
- 真实密码、COS 密钥、Supabase 密钥、Dify key、voice provider key 只允许存在于服务器 `.env`、本地 `.env.local`、CI Secret 或部署平台 Secret；不得写入本文档、progress、handoff、commit message 或聊天记录。
- 如果 goal 在本机跑真实 app 链路，本机仍需要 `app/.env.local`。服务器 `.env` 只能作为安全来源，不代表本机进程已经拿到参数。
- 如果 goal 在服务器或 worker 环境跑真实 worker 链路，以 `/srv/jingjing-video-worker/.env` 为准；worker 支持 `WORKER_COS_SECRET_ID`、`WORKER_COS_SECRET_KEY`、`WORKER_COS_BUCKET`、`WORKER_COS_REGION` 覆盖通用 `COS_*`。

服务器侧安全预检命令，只输出 SET / EMPTY：

```bash
cd /srv/jingjing-video-worker
python3 - <<'PY'
from pathlib import Path

keys = [
    "SUPABASE_DB_URL",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
    "WORKER_COS_SECRET_ID",
    "WORKER_COS_SECRET_KEY",
    "WORKER_COS_BUCKET",
    "WORKER_COS_REGION",
    "WORKER_COS_RESULT_PREFIX",
]

values = {}
for line in Path(".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    name, value = line.split("=", 1)
    values[name.strip()] = value.strip().strip("'\"")

for key in keys:
    print(f"{key}={'SET' if values.get(key) else 'EMPTY'}")
PY
```

goal 执行时的判断规则：

- 本地 `app/.env.local` 缺失时，先判定“本机 app 真实 COS 链路未注入参数”，不能把真实上传 / 下载失败归因到代码。
- 服务器 `.env` 有 COS 参数时，可以在服务器侧跑 worker / COS smoke；如果需要本机 app 也跑真实 COS，必须通过安全方式把同一组参数写入本机 `app/.env.local`。
- 任何从服务器读取 `.env` 的动作都不得打印变量值；检查报告只能写 `SET / EMPTY`。
- 不能把 SSH 密码写进文档或脚本。需要免交互长期跑 goal 时，应改用受限 SSH key 或部署机 Secret。

## 2.3 本地 COS CORS 已知状态

`jj-content-staging-1341668543` 已放行本地调试来源 `http://localhost:3001`，记录见：

- `docs/progress/2026-04-28-cos-cors-localhost-3001.md`

当前已知 CORS 规则：

- Origin：`http://localhost:3000`、`http://localhost:3001`、`https://jingjing-content-platform-staging.vercel.app`、`https://*.vercel.app`
- Methods：`PUT`、`GET`、`POST`、`HEAD`
- Allow-Headers：`*`
- Expose-Headers：`ETag`、`Content-Length`、`x-cos-request-id`
- Max-Age：`600`
- Vary：已开启

goal 执行判断：

- 如果浏览器地址是 `http://localhost:3001` 且仍然出现 COS CORS 错误，优先检查签名、Content-Type、请求方法、请求头和对象 key，不要直接重复归因到 bucket CORS 未放行。
- 如果浏览器地址是 `http://127.0.0.1:3001`，这对 CORS 是另一个 Origin，不能复用 `http://localhost:3001` 的放行结论。

## 3. 全局硬边界

- Dify 是新生成主链路；现有视频脚本、测试草稿、手工确认脚本和非 Dify `video_script` variant 是兼容辅路 / 回退通道。
- Dify 最终 JSON 字段以 `2026-05-13-Dify最终JSON字段确认器.html` 为准，目标合同是 `article.*`、`video.*`、`quality.*`、`debug.*`。
- Dify JSON 目前尚未完整落到现有代码，必须通过融合 adapter / feature flag / 独立 worker 路径接入。
- 不删除、不重写、不破坏现有视频脚本、测试草稿、`video_edit_jobs.input_payload` 和 video worker 合同。
- `outputs.final_result_json` 不得直接作为 `video_edit_jobs.input_payload`。
- feature flag 打开时，新生成任务优先走 Dify 主链路；feature flag 关闭或 Dify schema / API 失败时，现有辅路必须继续可用。
- Dify 主链路和现有辅路最终都复用同一个 `video_edit_jobs.input_payload` 生成器，禁止维护两套 worker input schema。
- `article.*` 落图文 variant。
- `video.*` 落 `video_script` variant。
- `quality.*` 控制 `passed / needs_review / blocked`。
- `debug.*`、`workflowVersion` 只进 trace / metadata。
- 团队素材按 `merchant_id` 隔离。
- 个人克隆声音按 `created_by_user_id` 私有。
- 用户端 / 成员端临时上传素材不进入 `merchant_media_*`，不长期保存，不切片打标签。
- COS 不当数据库；索引、权限、标签、状态和检索都在 DB / 服务端。
- 下载 URL 给 OpenStoryline / Pexels-compatible / 素材库外部预览时必须 60 天有效，但不能是永久 public bucket URL。平台内登录态成片预览可走 app route 短期重签，并区分 `inline` 预览和 `attachment` 下载。
- Pexels-compatible 响应只模仿 Pexels 请求 / 响应外壳，内部标签体系不暴露给 OpenStoryline。
- 每个阶段必须有测试和 progress 记录。
- 不 push、不 merge，除非用户另行明确要求。

## 4. 推荐执行顺序

### 阶段 A：Dify final_result_json 落库

目标：

- 新增或补齐 `content_generation_batches` / `content_generation_jobs` 或等价实现。
- 新增 content-generation-worker / fusion adapter 能调 Dify 或以 fixture 模拟 Dify；不能改坏现有视频脚本生成路径。
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
- 成功时创建一个 draft，下挂 `note` 和 `video_script` 两个 variant；该 variant 必须能被现有视频工作台以兼容方式读取。
- `quality.status = blocked` 或关键字段缺失时，不得创建可投产视频任务。

硬门禁：

- 不把 Dify 总包直接写入 `video_edit_jobs.input_payload`。
- `video_script` variant payload 以 Dify `video.*` 为主。
- 原始 Dify 包可保存在 job `output_json`，但前台和视频工作台消费 variant payload。
- 现有非 Dify `video_script` variant 创建视频任务的路径必须继续可用。
- feature flag on 默认走 Dify 主链路；feature flag off 默认走现有辅路。

测试：

- 正常 Dify fixture：生成 note + video_script。
- 缺 `video.scenes[]`：进入 `schema_failed` / `needs_review`。
- `quality.status = blocked`：不允许创建视频任务。
- 重复 workflow run / job：幂等，不重复创建有效 variant。
- 现有测试草稿 / 现有 video job payload 单测继续通过。
- feature flag on / off 各跑一组：Dify 主链路和现有辅路都能落同类 `video_script` variant。

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
- V1 切片策略采用“确定性整段 clip”：
  - 图片素材生成 1 条 image clip。
  - 视频素材生成 1 条 full_video clip。
  - `clip_index = 0`。
  - `start_time_seconds = 0`。
  - `end_time_seconds = duration_seconds`。
  - V1 不自动分镜、不重编码、不裁剪视频，`clip_cos_key` 默认引用原始视频 COS key。
  - 超过配置时长上限的视频进入 `needs_reclip`，不自动 ready。
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
- V1 不允许用 LLM 判断切片点。
- 视频缩略图优先取中点帧；失败取第 1 秒；时长不足 1 秒取第 0 秒。
- 缩略图缺失不得 ready。
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
  - 现有非 Dify `video_script` 生成的脚本。
  - 私有素材检索 / input assets。
  - `voice_profile` 模式。
- video worker 能校验 payload。
- OpenStoryline 使用 Pexels-compatible base URL 检索素材。
- 使用 60 天 URL 下载私有素材。
- 使用个人克隆声音生成 voiceover。

硬门禁：

- `video_edit_jobs.input_payload` 不接收 Dify 原始总包。
- Dify 来源和非 Dify 来源都必须复用同一个 payload builder。
- `script.locked = true`。
- `voice_profile` 模式必须有 `voice_profile_id`、`ref_audio_asset_id`、`ref_audio_asset`。
- `voiceover_artifacts` 缺失时克隆声音 job 不算完全通过。

测试：

- system voiceover job。
- voice_profile job。
- Dify 来源 video_script job。
- 非 Dify 来源 video_script job。
- 私有素材检索 job。
- OpenStoryline 不配置真实 Pexels key 也能检索私有素材。
- 所有失败能定位到 download / voice_ref / provider / openstoryline / upload / persistence。

## 5. 最终 Completion Gate

只有同时满足以下条件，才算完成：

- Dify final JSON fixture 通过 schema gate，并落 note + video_script variants。
- feature flag on 时，新生成任务默认走 Dify 主链路；feature flag off 或 Dify 失败时，现有辅路仍能创建合法 `video_edit_jobs.input_payload`。
- 现有视频脚本、测试草稿、`video_edit_jobs.input_payload`、video worker 相关测试继续通过。
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

- 缺 COS 真实 bucket / CAM 权限。
- 缺 staging DB 权限，且没有任何 local repository / fixture / mock 可替代验证当前代码合同。
- OpenStoryline 服务不可用且本地无法启动。

不能标记为本轮外部阻塞：

- 缺 Dify API key / workflow id。必须用 fixture / mock 完成 Dify adapter 和 schema gate。
- 缺真实 Supabase API key。必须用可替代的 repository / migration / fixture 测试覆盖本轮合同。
- 本机缺真实声音克隆 provider key。真实 RunningHub clone key 以服务器 `/srv/jingjing-video-worker/.env` 为准；若本机没有，必须先做服务器 SET / EMPTY 预检，不能直接判缺。当前代码适配名 `pixelle_clone` 可视为 RunningHub clone 别名，并用 mock 验证克隆声音状态机和 worker payload。

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
- 不为了接入 Dify JSON 破坏现有视频脚本和 worker 主合同。
- 不把 Dify 主链路做成绕过现有 payload builder 的第二套 worker 传输合同。
- 不用 public COS bucket 解决下载问题。
- 不返回永久公开 COS URL。
- 不把成员端临时上传素材写入团队素材库。
- 不把个人 voice profile 做成团队共享资产。
- 不只靠 RLS，不在 repository 中省略 `merchant_id` / `created_by_user_id`。
- 不跳过测试直接写“完成”。
- 不 push / 不 merge，除非用户明确要求。
