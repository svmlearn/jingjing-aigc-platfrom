# 2026-05-21 视频剪辑链路可批注图 handoff

## 当前目标

给 W 同学 / 产品侧一份可直接打开、可逐点批注的 HTML，重点让“脚本 -> 素材 -> 剪辑”的现有链路用链路节点形式看清楚。

文件：

- `docs/progress/2026-05-21-video-edit-chain-annotatable-map.html`
- `docs/progress/2026-05-22-video-edit-chain-node-map.html`

## 2026-05-22 追加调整

用户要求链路“单独弄一个页面，但跟主页面联动，带上输入、处理过程、输出、判断条件”。

已完成：

- 新增独立链路节点页：`docs/progress/2026-05-22-video-edit-chain-node-map.html`。
- 主页面 `#langgraph-chain` 改为“独立链路页入口 + 主页面/链路页分工摘要”。
- 主页面入口包含：
  - 进入链路节点页。
  - 直接跳到素材判断节点。
  - 直接跳到剪辑引擎节点。
- 独立链路页顶部和底部都可返回主页面相关章节。
- 两个页面共用同一个本地批注保存 key：`jingjing-video-chain-notes-v1`。
- 主页面导出批注时已过滤隐藏的历史链路草稿，只汇总当前可见批注。

独立链路页每个节点都按固定结构展示：

- 输入。
- 处理过程。
- 输出。
- 判断条件。
- 通俗解释。
- 例子。
- 批注框。

独立链路页节点包括：

- `START`：脚本确认。
- `N1`：脚本拆成镜头需求。
- `N2`：素材来源判断。
- `N3A`：成员上传素材。
- `N3B`：COS/OSS 商家素材库检索。
- `N3C`：素材确认节点。
- `N4`：声音、字幕、lip-sync 判断。
- `N5`：创建 `video_edit_jobs`。
- `N6`：worker 领取任务并准备素材。
- `N7`：OpenStoryline / FireRed 剪辑引擎。
- `END`：成片上传并回写前端。
- `FAIL`：失败分流与重试/人工处理。

用户继续要求“剪辑引擎里的每一步也要”。已在独立链路页 `N7` 后新增 FireRed / OpenStoryline 内部子节点：

- `F0 Adapter`：把 worker 合同转成 FireRed 生产指令。
- `F1 load_media`：读取本地素材。
- `F2 split_shots`：把素材切成可用片段。
- `F3 understand_clips`：理解每段素材内容与质量。
- `F4 search_media / candidate match`：补检索与候选素材匹配。
- `F5 generate_voiceover`：生成系统配音或克隆配音。
- `F6 subtitle / alignment`：生成字幕和音频对齐。
- `F7 plan_timeline / plan_timeline_pro`：规划最终时间线。
- `F8 lip_sync`：只对真人口播段做口型同步。
- `F9 render_video`：渲染 `final.mp4`。
- `F10 ValidateEngineOutputs`：校验成片、字幕、封面和 lip-sync 是否真实被消费。

这些 F 节点也全部带输入、处理过程、输出、判断条件、例子和批注框。

用户继续要求“具体字段要求解释”。已在独立链路页补充：

- `剪辑引擎字段字典`：列出核心字段的类型/是否必填、来源、用途、通俗解释和要求。
- 字段覆盖：
  - `job_id`、`merchant_id`、`draft_id`、`content_variant_id`
  - `workspace_dir`、`output_dir`
  - `input_assets[].local_path`、`asset_type`、`role`、`tags`、`labels`、`metadata`
  - `script_text`
  - `production_directive.desired_outputs`
  - `production_config.voiceover.mode/provider`
  - `voiceProfileId`、`refAudioAssetId`
  - `production_config.subtitles.talkingHeadSource`
  - `production_config.lip_sync.enabled/provider/scope/inputRequirements`
  - `production_config.render.aspectRatio`
  - `service_config`
  - `lip_sync.plan_timeline`
- F0-F10 每个内部步骤下新增“本步骤重点字段”和“字段解释”，方便在具体节点上直接批注字段要求。

用户继续追问“音乐链路呢”。已在独立链路页补充音乐 / BGM 链路：

- 字段字典新增：
  - `production_config.bgm.enabled`
  - `production_config.bgm.userRequest`
  - `production_config.bgm.include/exclude`
  - `production_config.bgm.volume`
- N7 内部步骤总览新增音乐入口 `M0-M5`。
- 新增音乐节点：
  - `M0 BgmConfig`：决定是否配音乐、音乐需求和音量。
  - `M1 BgmResourceReady`：检查 `resource/bgms` 和 `meta.json` 是否可用。
  - `M2 FilterCandidates`：按 `mood/scene/genre/lang/id` 筛选候选音乐。
  - `M3 select_bgm`：选择一首背景音乐。
  - `M4 AnalyzeMusicMetrics`：分析 duration、bpm、beats、energy 等音乐指标。
  - `M5 BgmTrackToTimeline`：把 BGM track 放进时间线并在 render 时混音。
- 页面明确记录当前真实风险：2026-05-21 服务器任务曾卡在 `select_bgm`，模型采样 450 秒超时，最终 worker 2700 秒超时失败；需要产品决定超时后跳过、降级还是失败。

## 本轮重要调整

用户反馈上一版“不是这样的”，明确要“链路节点的形式”，并且“每个节点都要用通俗易懂的方式解释”。

已把原来的 LangGraph 卡片说明段重做为节点链路图：

- 顶部 State 说明：把整条链路解释为一张不断被补全的“剪辑任务单”。
- 总链路横向节点：`START -> N1 -> N2 -> N3 -> N4 -> N5 -> N6 -> N7 -> END`。
- 详细节点链：
  - `START`：脚本已确认，可以开始剪辑。
  - `N1 ScriptToScenes`：把脚本拆成镜头需求。
  - `N2 MaterialRoute`：判断素材来源，分为成员素材和 COS/OSS 商家素材库。
  - `N3A CollectMemberAssets`：收集成员上传素材。
  - `N3B RetrieveMerchantLibraryAssets`：检索商家 COS/OSS 素材库。
  - `N4 VoiceAndSubtitleRoute`：决定系统配音、个人克隆音色、字幕和 lip-sync。
  - `N5 AssembleVideoEditJob`：创建 `video_edit_jobs` 和 `input_payload`。
  - `N6 WorkerClaimAndPrepare`：worker 领取任务、下载素材、准备本地文件。
  - `N7 OpenStoryline / FireRed`：真正剪辑、配音、口型同步和渲染。
  - `END UploadResultAndPreview`：上传成片并回写前端预览/下载。
- 每个节点都包含：
  - 白话解释。
  - 读入什么。
  - 写回什么。
  - 对应实现位置或字段。
  - 具体例子。
  - 可批注 textarea。
- 新增失败边和产品建议节点：
  - 失败边区分素材缺失、对象存储失败、lip-sync 输入不合规、render 未消费 retalked timeline。
  - 建议新增“素材确认节点”，放在素材汇合之后、声音策略之前。
- 新增两个完整例子：
  - 普通商家素材库出片。
  - 真人口播 + 克隆音色 + lip-sync。

## 当前 HTML 覆盖内容

- 后端服务器视角：Nginx、Next.js app、PostgreSQL、对象存储、内容生成 worker、video-worker、OpenStoryline / FireRed。
- 视频剪辑主链路：确认脚本 -> 创建 `video_edit_jobs` -> worker claim -> 下载输入素材 -> 调用 OpenStoryline / FireRed -> 上传结果 -> 前端预览 / 修订。
- 链路节点图：脚本到素材到剪辑的 LangGraph-style 节点展示。
- 接口与数据合同：素材上传、声音上传、创建剪辑任务、worker 轮询、预览下载等接口。
- 状态机与失败归因：pending / queued / preparing / running / succeeded / failed_manual / failed_retryable / cancelled。
- COS/OSS 素材库链路：产品叫 COS 素材库，当前国内默认对象存储为 `aliyun_oss`，兼容历史 `tencent_cos` 命名。
- 素材选择规则：成员素材、个人声音、商家素材库、worker 本地临时素材、FireRed 中间产物。
- 成员端链路：成员页面 -> 普通素材上传 -> 声音克隆托管上传 -> 创建/轮询 AI 剪辑任务。
- 真人口播 / 克隆音色 / lip-sync 细节和验收风险。
- 需要产品拍板的问题清单。

## 依据

主要综合了：

- `docs/架构规范/2026-04-28-current-architecture.md`
- `docs/架构规范/2026-05-14-COS私有素材库与个人克隆声音工作方案.md`
- `docs/架构规范/2026-05-20-真人口播口型替换与精准字幕架构方案.md`
- `docs/progress/2026-05-19-cos-to-oss-local-migration.md`
- `docs/progress/2026-05-19-aliyun-member-dify-script-to-video-e2e.md`
- `docs/progress/2026-05-21-lip-sync-server-release.md`
- `workers/video-worker/README.md`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/media-service.ts`
- `app/src/app/api/voice-profiles/upload/route.ts`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `deploy/domestic/systemd/*.service`
- `deploy/domestic/nginx/jingjing-domestic.conf`

## 关键口径

- 产品层仍可说“COS 素材库”，但 HTML 已标明当前国内生产默认对象存储是 `aliyun_oss`，并兼容历史 `tencent_cos`。
- 当前商家素材库真实实现使用 `source_items + asset_objects`，不是历史设想里的 `merchant_media_assets / merchant_media_clips`。
- 普通系统配音、商家素材库补素材、成片上传和 preview/download 已有真实成功记录。
- lip-sync / 克隆音色链路已发布到服务器，但尚未完成真实 `upload -> clone_tts -> lip_sync -> timeline -> render -> oss` 全链路验收。
- 成员声音克隆音频上传目前走 `POST /api/voice-profiles/upload` 服务端托管上传，不走普通浏览器直传。

## 验证结果

已完成静态验证：

- 主页面 HTML 字节数：121545。
- 主页面可见批注框数量：按脚本过滤隐藏草稿后导出。
- 主页面全部批注 ID 数量：73。
- 主页面重复批注 ID：无。
- 独立链路页 HTML 字节数：102395。
- 独立链路页批注框数量：34。
- 独立链路页重复批注 ID：无。
- 章节齐全：`server`、`video-chain`、`langgraph-chain`、`contracts`、`states`、`material-chain`、`asset-rules`、`member-chain`、`lip-sync-detail`、`decision-points`、`notes-export`、`sources`。
- 主页面存在独立链路页链接：`2026-05-22-video-edit-chain-node-map.html`。
- 独立链路页存在返回主页面链接：`2026-05-21-video-edit-chain-annotatable-map.html#langgraph-chain`。
- 独立链路页关键结构存在：输入、处理过程、输出、判断条件。
- 剪辑引擎内部节点存在：`F0` 到 `F10`。
- 剪辑引擎字段字典存在，且 F0-F10 每步都有“本步骤重点字段”。
- 音乐链路存在：`M0` 到 `M5`，BGM 字段和 `select_bgm` 超时风险已写入。
- `git diff --check -- docs/progress/2026-05-21-video-edit-chain-annotatable-map.html docs/progress/2026-05-22-video-edit-chain-node-map.html docs/handoff/2026-05-21-video-edit-chain-annotatable-map-handoff.md`：通过。

受限事项：

- Codex Browser 因安全策略拒绝自动访问本地 `file://` 页面，因此未能自动截图验证。用户当前 in-app browser 已打开该 file URL，可手动刷新查看新版。

## 改动文件

- `docs/progress/2026-05-21-video-edit-chain-annotatable-map.html`
- `docs/progress/2026-05-22-video-edit-chain-node-map.html`
- `docs/handoff/2026-05-21-video-edit-chain-annotatable-map-handoff.md`

另外，本轮之前曾按 `$codex-error-log` 记录 PowerShell `node -e` 引号问题到全局错误库：

- `C:\Users\17330\.codex\docs\codex-runtime-errors.md`
- 记录 ID：`GE-20260521-005`

## Branch / worktree

- 当前目录：`D:\codexplan\jingjingstart`
- 当前 branch：`main`
- 未开新 worktree。
- 原因：本轮只修改文档型 HTML 和 handoff，没有改业务代码。

## Commit / push / merge

- 未 commit。
- 未 push。
- 未 merge。

## 下一步建议

1. 用户在当前浏览器页面刷新 `docs/progress/2026-05-21-video-edit-chain-annotatable-map.html`。
2. 重点批注 `#langgraph-chain` 中各节点，尤其是素材来源判断、素材确认节点、声音策略、lip-sync 失败降级。
3. 批注完成后导出 JSON 或汇总到页面下方，再沉淀成产品任务书或技术实现清单。
