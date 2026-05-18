# OpenStoryline 阿里云全家桶迁移方案

状态：探索方案，待实现验证  
日期：2026-05-18  
目标地域：华东 1（杭州）

## 1. 背景和目标

当前视频生产链路已经收敛为：

```text
app
-> video_edit_jobs
-> video-worker
-> openstoryline-engine
-> FireRed/OpenStoryline
-> 视频产物
-> 媒体存储
-> app 预览审核
```

本方案目标是把 OpenStoryline / FireRed 及其上游执行链路迁到阿里云全家桶：

- 业务基础设施部署在华东 1（杭州）：app、worker、OpenStoryline/FireRed、OSS、RDS PostgreSQL、容器运行环境。
- AI 模型统一使用阿里云百炼 / DashScope：LLM、VLM、TTS、声音复刻、ASR、AI 转场/视频生成。
- 生产环境禁止 fallback 到 GLM、OpenAI、字节、MiniMax、腾讯 COS 等第三方能力。
- 保留现有业务语义和主链路，不把迁移变成重新设计产品。

## 2. 地域原则

### 2.1 杭州作为业务主地域

以下资源统一选择华东 1（杭州）：

- OSS bucket：用户上传素材、worker 输入素材、worker 输出视频、封面、字幕、声音复刻参考音频。
- RDS PostgreSQL：承接当前 Supabase Postgres 里的业务表和 worker 表。
- ECS / ACK / SAE：承载 Next.js app、自托管 API、video-worker、openstoryline-engine、FireRed/OpenStoryline。
- 日志、监控、安全组、VPC、内网访问规则。

### 2.2 百炼模型服务的地域例外

截至 2026-05-18，阿里云百炼官方模型服务地域不包含杭州。国内模型调用应使用“中国内地部署范围”，其绑定地域为华北 2（北京），OpenAI 兼容 Base URL 为：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

因此，本项目的地域规则是：

```text
业务数据和运行环境：杭州
百炼模型 API：使用中国内地部署范围 / 北京 endpoint
```

实现时不要写成“杭州百炼 endpoint”，也不要混用国际站或新加坡 endpoint。

参考文档：

- https://help.aliyun.com/zh/model-studio/regions/
- https://help.aliyun.com/zh/model-studio/model-calling-in-sub-workspace

## 3. 目标架构

```text
浏览器 / 商家端
-> Next.js app / 自托管 API（杭州）
-> OSS upload intent（杭州 OSS）
-> asset_objects / video_edit_jobs（杭州 RDS PostgreSQL）
-> video-worker（杭州容器）
-> openstoryline-engine（杭州容器）
-> FireRed/OpenStoryline（杭州容器）
-> DashScope / 百炼模型（中国内地部署范围，北京 endpoint）
-> final.mp4 / cover / subtitles 上传 OSS（杭州）
-> video_edit_jobs.result_payload 回写 RDS
-> app 预览审核
```

保留 `video_edit_jobs.input_payload` 作为 app 和 worker 的稳定合同。app 仍然负责脚本确认、素材绑定和 job 创建；worker 仍然只做稳定执行，不负责重新理解业务策略。

## 4. 模型映射

| 能力 | 阿里云目标模型/服务 | 用途 |
| --- | --- | --- |
| LLM | `qwen-plus` | 脚本整理、节点规划、参数推断、文本 JSON 输出 |
| VLM | `qwen3-vl-plus` | 素材画面理解、片段筛选、图像/视频帧理解 |
| TTS | `cosyvoice-v3.5-plus` | 普通配音 |
| 声音复刻 | CosyVoice voice enrollment | 商家参考音频注册 voice，并用于后续 TTS |
| ASR | `paraformer-v2` | 真人口播原声识别、字幕来源 `asr_original_audio` |
| AI 转场/视频生成 | `wan2.2-kf2v-flash` | OpenStoryline 里的 AI transition / Wan 视频生成能力 |

第一版默认模型可以先固定，避免 app 侧暴露复杂模型选择。后续若要做成本/效果分层，再在平台管理端增加模型策略。

## 5. 环境变量建议

### 5.1 OpenStoryline / 百炼

```env
OPENSTORYLINE_LLM_MODEL=qwen-plus
OPENSTORYLINE_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENSTORYLINE_LLM_API_KEY=<bailian_mainland_api_key>

OPENSTORYLINE_VLM_MODEL=qwen3-vl-plus
OPENSTORYLINE_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENSTORYLINE_VLM_API_KEY=<bailian_mainland_api_key>

DASHSCOPE_API_KEY=<bailian_mainland_api_key>
AI_TRANSITION_DASHSCOPE_API_KEY=<bailian_mainland_api_key>
AI_TRANSITION_DASHSCOPE_MODEL=wan2.2-kf2v-flash
```

### 5.2 TTS / 声音复刻 / ASR

```env
OPENSTORYLINE_TTS_PROVIDER=aliyun_cosyvoice
ALIYUN_TTS_MODEL=cosyvoice-v3.5-plus
ALIYUN_TTS_API_KEY=<bailian_mainland_api_key>

ALIYUN_VOICE_ENROLLMENT_ENABLED=true
ALIYUN_VOICE_ENROLLMENT_API_KEY=<bailian_mainland_api_key>

OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer
ALIYUN_ASR_MODEL=paraformer-v2
ALIYUN_ASR_API_KEY=<bailian_mainland_api_key>
```

### 5.3 OSS / RDS / strict 模式

```env
DATABASE_URL=postgresql://<user>:<password>@<rds-host>:5432/<db>

STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=<bucket>
ALIYUN_OSS_ACCESS_KEY_ID=<access_key_id>
ALIYUN_OSS_ACCESS_KEY_SECRET=<access_key_secret>
WORKER_OSS_RESULT_PREFIX=video-results

OPENSTORYLINE_FULL_ALIYUN_ONLY=true
```

生产环境中，`OPENSTORYLINE_FULL_ALIYUN_ONLY=true` 时必须拒绝启动以下配置：

- `OPENAI_API_KEY`
- GLM / 智谱相关模型配置
- 字节 TTS 配置
- MiniMax TTS 或视频配置
- Tencent COS / `COS_SECRET_ID` / `COS_SECRET_KEY`
- `storage_provider=tencent_cos`

## 6. 代码改造边界

### 6.1 OpenStoryline / FireRed

需要调整：

- `workers/video-worker/openstoryline/firered/config.toml`
- `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- TTS node：新增 `aliyun_cosyvoice` provider。
- ASR node：新增 `aliyun_paraformer` provider，替代当前本地 FunASR 默认路径。
- 启动校验：strict full-aliyun 模式下检查第三方 provider 是否关闭。

现有 AI transition 已有 `dashscope` / Wan 线索，应保留并把生产默认值切到 `wan2.2-kf2v-flash`。

### 6.2 worker 存储层

当前 worker 里存储客户端和合同仍偏腾讯 COS：

- `workers/video-worker/worker/app/cos_client.py`
- `workers/video-worker/worker/app/models.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/real_io_smoke.py`

目标改造：

- 新增或替换为 OSS storage adapter。
- `storage_provider` 接受并要求 `aliyun_oss`。
- 输入素材、声音复刻参考音频、输出视频/封面/字幕都走 OSS。
- `asset_objects.storage_provider` 回写 `aliyun_oss`。
- 旧的 `tencent_cos` 仅可用于历史数据读取或迁移脚本，不进入生产新 job。

### 6.3 app 存储和上传

app 侧需要把上传链路从 COS 改为 OSS：

```text
/api/media/upload-intents
-> OSS presigned upload / browser direct upload
-> /api/media/complete
-> asset_objects(storage_provider='aliyun_oss')
-> video_edit_jobs.input_payload.input_assets
```

app 创建 video job 前仍必须阻断：

- 未确认脚本。
- 空脚本。
- 没有可下载 OSS 输入资产。
- bucket/key/provider 为空。
- 已确认素材但没有成功落到 OSS 的情况。

### 6.4 数据库和 Auth

当前业务真相源是 Supabase Cloud。全云迁移目标是：

- RDS PostgreSQL 承接业务表结构和数据。
- worker 继续使用 PostgreSQL 直接连接、`FOR UPDATE SKIP LOCKED` claim job。
- app 侧把 Supabase client 调用收敛成服务端数据访问层，避免前端直接绑定 Supabase SDK。
- Auth 可选阿里云 IDaaS / OIDC，或先做项目自托管 session，不能继续依赖 Supabase Auth 作为生产唯一身份源。

第一阶段可以先迁 worker 所需表和服务端 API；完整替换 Supabase Auth 属于第二阶段，不应阻塞 OpenStoryline 出片验证。

## 7. 分阶段实施路线

### 阶段 1：模型全阿里云

- 配置 LLM/VLM 到 DashScope OpenAI compatible endpoint。
- 新增 CosyVoice TTS provider。
- 新增 voice enrollment 支持。
- 新增 Paraformer ASR provider。
- 确认 Wan AI transition 使用 DashScope。
- 禁止第三方模型 fallback。

验收：本地或服务器容器内完成一次真实 OpenStoryline 出片，日志中只出现阿里云模型 provider。

### 阶段 2：OSS 替换 COS

- app 上传意图改为 OSS。
- worker 下载输入素材、参考音频和上传结果改为 OSS。
- `asset_objects` 和 `input_payload.input_assets` 使用 `aliyun_oss`。
- 增加 OSS smoke test。

验收：上传素材、worker 下载、结果上传、app 预览都使用杭州 OSS。

### 阶段 3：RDS PostgreSQL 替换 Supabase Cloud

- 迁移表结构和必要数据到 RDS。
- worker `DATABASE_URL` 指向 RDS。
- app 服务端 API 改为连接 RDS。
- 补数据访问层测试。

验收：创建 job、claim job、回写 result、写入 asset_objects 全部在 RDS 完成。

### 阶段 4：杭州生产部署

- app、worker、openstoryline-engine、FireRed/OpenStoryline 部署到杭州 ECS / ACK / SAE。
- 配置 VPC、安全组、内网 RDS、OSS 权限、日志采集。
- 建立最小回滚点：镜像版本、数据库备份、OSS 前缀隔离。

验收：从 app 创建视频任务到预览审核完成一条真实链路。

## 8. 验收清单

文档验收：

- 明确杭州是业务基础设施主地域。
- 明确百炼模型使用中国内地部署范围 / 北京 endpoint 作为必要例外。
- 覆盖 OSS、RDS、OpenStoryline、worker、app、环境变量和 strict 模式。

实现验收：

- OSS 上传下载通过。
- RDS `video_edit_jobs` claim / update / result payload 回写通过。
- 声音复刻：参考音频注册 voice 并用于生成配音。
- ASR 字幕：真人口播素材生成 `asr_infos`，并能进入 `asr_original_audio` 字幕链路。
- 真实出片：生成 final video、cover、subtitle。
- app 预览：能读取 OSS 结果并展示。
- 日志审计：生产链路无第三方模型、无腾讯 COS 新写入。

## 9. 风险和注意事项

- 百炼模型地域不是杭州，必须在文档、环境变量、部署脚本中显式说明，避免误配。
- 声音复刻涉及用户音频授权和隐私，后续产品上需要补授权确认、用途说明和删除机制。
- `storage_provider` 从 `tencent_cos` 改为 `aliyun_oss` 会影响 app、worker、历史数据和测试，需要分阶段兼容或迁移。
- Supabase Auth 替换比 worker/RDS 迁移更复杂，建议不要和首条 OpenStoryline 出片验收绑死。
- strict full-aliyun 模式必须失败得足够早，不能等到视频任务跑一半才发现 fallback 到第三方。

## 10. 后续沉淀

这份文档当前放在 `docs/探索/`，表示方案还没有完成实现验证。

当以下条件满足后，应把稳定结论沉淀到 `docs/架构规范/`：

- 杭州 OSS + RDS + worker 链路跑通。
- 百炼模型全链路出片跑通。
- app 预览审核跑通。
- strict full-aliyun 启动校验和日志审计通过。
