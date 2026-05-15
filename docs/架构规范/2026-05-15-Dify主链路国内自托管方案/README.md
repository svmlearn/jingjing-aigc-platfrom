# 2026-05-15 Dify 主链路国内自托管方案

## 阅读顺序

1. `01-依据与全局硬门禁.md`
2. `02-工作流程与队列.md`
3. `03-数据合同与落库边界.md`
4. `04-国内自托管部署边界.md`
5. `05-视频触发与Worker合同.md`
6. `06-测试验收纠错与上线.md`
7. `07-门禁解释与把关清单.md`

## 一句话结论

Dify 是内容生成和视频脚本生成主链路；它只负责生成、解析和落库，不直接触发视频服务器。

用户确认 `content_variants.variant_type = video_script` 后，点击“AI 剪辑 / 生成视频”，主 app 才创建 `video_edit_jobs.input_payload`，video-worker 再转换为 `ProductionDirective` 并调用 OpenStoryline / FireRed。

## 当前硬边界

- Dify final JSON 只能进内容解析、留痕和落库。
- Dify `video.scenes[]` 必须结构化持久化到 `content_variants.production_scenes`。
- OpenStoryline / FireRed 不直接读取 Dify 原始 JSON。
- 当前阶段只做单队列、单实例、单并发消费。
- Dify job succeeded 后不得自动创建 `video_edit_jobs`。
- 国内正式链路目标是国内自托管 Node/API、国内 PostgreSQL、国内 COS/OSS，不以 Vercel serverless 为目标运行环境。
- 真实 key、服务器密码、provider secret 不写入仓库文档。

## 给 M 同学的落地顺序

1. 先补 `content_variants.production_scenes` migration 和 repository 映射。
2. Dify V3.1 final JSON mapper 已作为当前主线；旧 fixture adapter 口径已清理。
3. 接 content-generation 单队列消费器，不塞进 video-worker。
4. 在目标运行环境配置 Dify env，并用脱敏命令确认 present。
5. 跑 1 条真实 Dify smoke：Dify -> `content_drafts` / `video_script`。
6. 确认 Dify 成功后没有自动 `video_edit_jobs`。
7. 用户确认脚本后点击 AI 剪辑，再验证 `video_edit_jobs` -> video-worker -> OpenStoryline / FireRed。

## 外部资料使用规则

- Dify API、文件上传、自托管部署，以 Dify 官方文档和 `langgenius/dify` GitHub 为准。
- FireRed / OpenStoryline，以 `FireRedTeam/FireRed-OpenStoryline` GitHub 为准。
- Gitee 镜像、CSDN / 问答文章只用于识别国内部署常见问题，例如镜像拉取、端口冲突、`.env` 位置、升级后 `.env.example` 差异；不作为接口和版本真相源。
- 安全规则以 OWASP 文件上传建议、云厂商 COS 临时凭证文档和本项目多租户边界为准。
