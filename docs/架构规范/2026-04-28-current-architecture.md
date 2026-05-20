# 2026-04-28 当前系统架构总说明

## 1. 当前结论

当前项目主线已经收敛为：

```text
咨询台收集业务信息
-> 脚本制作 agent 生成并修订脚本候选
-> app 完成脚本确认、素材绑定和 video_edit_jobs.input_payload 合同化
-> video-worker 消费作业并调用 Docker 内部 OpenStoryline 服务
-> openstoryline-engine 将 ProductionDirective 映射到 FireRed/OpenStoryline worker API
-> FireRed/OpenStoryline 生成视频产物
-> video-worker 上传 COS 并回写 video_edit_jobs / asset_objects
-> app 做预览审核和修订分流
```

这份文档是当前架构真相源。旧的增长 Agent、旧 skeleton 默认路径、旧分阶段 work-plan 不再作为当前实现依据。

## 2. 职责边界

### 2.1 咨询台

咨询台负责收集和确认商家业务信息，包括：

- 商家定位
- 目标用户
- 核心卖点
- 服务或产品细节
- 口吻偏好
- 素材线索
- 禁止承诺或风险边界

咨询台不是视频 worker，也不直接生成 worker payload。

### 2.2 脚本制作 agent

脚本制作 agent 负责把咨询台已确认信息转成可审核的脚本候选。

当前项目不再单独设“增长 Agent / GrowthBrief / VideoStrategy / ScriptDrafts”作为主路径。相关决策信息来自咨询台上下文，脚本制作 agent 只在该上下文内做脚本组织、候选差异化和修订。

脚本制作 agent 必须遵守：

- 不编造咨询台没有确认的商家事实。
- 不生成医疗、效果、收益等不可承诺内容。
- 输出结构化脚本候选，方便 app 持久化和人工确认。
- 语义修订回到脚本制作 agent，不进入 worker。

### 2.3 app

app 负责确认和合同化，是业务语义进入执行层的唯一门禁。

app 必须负责：

- 脚本确认门禁。
- 素材上传和素材绑定。
- COS 输入资产规范化。
- 组装 `video_edit_jobs.input_payload`。
- 创建和查询 video job。
- 展示 worker 回写结果。
- 预览审核。
- 区分语义修订和制作修订。

app 不应该直接调用 FireRed/OpenStoryline，也不应该把 agent 自由文本直接交给 worker。

### 2.4 video-worker

video-worker 是稳定执行器。

worker 必须负责：

- 轮询并 claim `video_edit_jobs`。
- 校验 `input_payload`。
- 标准化为 `ProductionDirective`。
- 从 COS 下载输入素材。
- 调用 `openstoryline-engine /v1/runs`。
- 校验请求的输出产物。
- 上传 final video、cover、subtitles 到 COS。
- 回写 `video_edit_jobs.result_payload`、`failure_reason`、`log_payload`。
- 写入输出 `asset_objects`。

worker 不负责：

- 理解增长策略。
- 重写已锁定脚本。
- 选择业务素材。
- 判断视频应该如何修。

### 2.5 OpenStoryline / FireRed

当前真实视频引擎使用 Docker 内部服务：

```text
video-worker
-> openstoryline-engine:/v1/runs
-> firered-openstoryline:/api/worker/runs
```

`openstoryline-engine` 是平台合同适配层，负责把 worker 的 `ProductionDirective` 映射为 FireRed worker API 请求。

`firered-openstoryline` 是真实引擎服务，负责执行脚本、素材、TTS/BGM/字幕/渲染相关流程。

FireRed 不上浮到 app。app 只认 `video_edit_jobs` 和 `asset_objects`。

## 3. 数据和存储边界

### 3.1 Supabase

Supabase 是业务真相源，保存：

- 商家和账号数据。
- 咨询会话。
- source items。
- content drafts / variants。
- video edit jobs。
- asset object 元数据。
- 知识库和 RAG 元数据。

Supabase 不承载视频渲染长任务，不作为大视频文件主存储。

### 3.2 Tencent COS

COS 是媒体资产存储层，保存：

- 用户上传图片/视频。
- worker 输入素材。
- worker 输出视频。
- 封面。
- 字幕。
- 其他大媒体文件。

app 创建上传意图，浏览器直传 COS，完成后 app 创建 `asset_objects`。

worker 只消费 `asset_objects` 中可下载的 COS 资产。

### 3.3 服务器本地盘

服务器本地盘只用于：

- worker 临时文件。
- FireRed 运行时资源。
- 模型和素材缓存。
- 渲染中间产物。

本地盘不是长期真相源。最终结果必须回到 COS 和 Supabase。

## 4. 核心合同

`video_edit_jobs.input_payload` 是 app 和 worker 之间唯一稳定连接点。

当前必须包含：

- `script.text`：已确认脚本文本。
- `script.locked = true`：脚本已锁定。
- `productionDirective`：执行指令。
- `input_assets`：worker 可下载的 COS 输入素材。

`input_assets` 要求：

- `storage_provider` 必须是 `tencent_cos`。
- `bucket_name` 必须非空。
- `storage_key` 必须非空。
- app 生成 payload 时需要 trim bucket/key/provider。
- app 按 `sort_order` 升序、再按 `asset_id` 升序稳定排序。

已确认素材但没有可下载资产时，app 必须阻断创建 video job，不能交给 worker 空跑。

## 5. 视频工作台当前流程

### 5.1 首次制作

```text
咨询台信息
-> 生成视频脚本候选
-> 用户确认脚本
-> 用户上传或绑定分段素材
-> app 创建 video_edit_jobs
-> worker 执行
-> app 展示结果
```

### 5.2 本地运行与云端 Supabase

app 本地运行时也必须连接部署在云端的 Supabase，不再使用本地 Supabase、内存 demo 用户、内存 demo 商家或本地 real-chain 测试库作为业务数据源。

本地 `.env.local` 应配置云端 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`。缺少这些配置时，商家端登录、后台访问、平台后台和业务 API 必须明确失败，不能自动放行到 demo 模式。

真实跑通必须依赖：

- 云端 Supabase
- COS
- server worker
- Docker FireRed/OpenStoryline
- LLM/VLM/TTS provider secrets

### 5.3 素材上传

视频工作台分段上传必须走真实媒体链路：

```text
/api/media/upload-intents
-> COS upload
-> /api/media/complete
-> asset_objects
-> video_edit_jobs.input_payload.input_assets
```

只改前端 UI 状态不算上传成功。

## 6. 预览审核与修订

视频成功后，app 负责预览审核。

修订分两类：

### 6.1 语义修订

改变脚本含义、卖点、目标人群、口吻、CTA 的修订属于语义修订。

处理方式：

```text
回到脚本制作 agent
-> 生成新脚本候选
-> 用户确认
-> 创建新 video job
```

语义修订不能直接进入 worker。

### 6.2 制作修订

只改变字幕、节奏、封面、BGM、镜头顺序等制作表现的修订属于制作修订。

处理方式：

```text
基于已完成 sourceJobId
-> 创建新的 video job
-> worker 重新执行
```

没有已完成视频 job 时，不能把制作修订退化成普通首次制作任务。

## 7. Docker 生产部署

服务器真实视频引擎使用 Docker：

```bash
cd workers/video-worker
cp firered.env.example .env
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered up --build
```

生产路径必须配置：

- `SUPABASE_DB_URL`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `FIRERED_PROVIDER_KEY`
- `OPENSTORYLINE_LLM_*`
- `OPENSTORYLINE_VLM_*`
- 所选 TTS provider secrets

`docker-compose.yml` 默认 adapter 指向 `fire_red`，避免生产环境无意跑成 skeleton 占位视频。

`.env.example` 仅用于本地 skeleton smoke，不代表生产部署。

## 8. 失败分层

### 8.1 app 可见阻断

app 应在创建 job 前阻断：

- 未确认脚本。
- 空脚本。
- 非 COS 输入资产。
- COS 资产缺 bucket。
- 空 storage key。
- 用户已确认素材但没有可下载 input assets。

### 8.2 worker manual failure

worker 对合同错误标记 `failed_manual`，例如：

- malformed input payload。
- missing locked script。
- unsupported desired outputs。
- invalid input assets。

### 8.3 worker retryable failure

worker 对基础设施或运行时问题标记 `failed_retryable`，例如：

- COS 下载失败。
- FireRed/OpenStoryline 暂时不可用。
- 渲染失败。
- 上传失败。

## 9. 当前不做的事

当前不做：

- app 直接调用 FireRed。
- worker 负责理解业务策略。
- worker 重写脚本。
- Agent 直接输出 worker JSON 作为唯一真相源。
- 引入 MySQL/MongoDB 作为视频链路新真相源。
- 把本地 FireRed runtime 资源、模型、outputs、`.venv` 提交进仓库。

## 10. 当前验收状态

已验证：

- app video payload 单测。
- 脚本制作 agent 单测。
- app lint/typecheck/build。
- worker pytest 全量。
- FireRed compose config。

尚需服务器真实出片验收：

```text
video_edit_jobs
-> worker
-> /v1/runs
-> FireRed /api/worker/runs
-> final.mp4
-> COS
-> app preview
```
