# 2026-05-16 新加坡自托管周末全链路 QA 任务书

## 1. 任务判断

本任务书给 `codex/domestic-infra-migration` 分支继续使用。

当前不建议立刻把主精力切到 Aliyun OSS adapter。

原因：

```text
周末目标是利用现有新加坡腾讯云服务器，把“服务器 + 普通 PostgreSQL + 自托管 app + worker”
这条底座压到足够清楚。

OSS adapter 是下周国内阿里云资源采购后的必要适配，
但它主要是存储 provider 层问题，不应该挡住今晚/明天对产品主流程的 self-hosted QA。
```

本轮正确目标：

```text
把新加坡腾讯云 self-hosted 环境作为临时 staging，
在不使用真实敏感用户素材的前提下，
验证最新 main 集成后的产品主流程到底哪些已经能脱离 Vercel / Supabase 跑通，
哪些仍然依赖 Supabase 或 provider 配置。
```

不要把本轮结果写成国内 Phase 1 完成。

## 2. 当前状态

国内化 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

分支：

```text
codex/domestic-infra-migration
```

当前已知最新状态：

```text
HEAD: 16e3188 docs: record domestic clean release validation
代码修复: e28791c fix: use locked script in firered generation
远端当前 release: /srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean
```

已经通过：

- app clean build / deploy
- `/api/health`
- PostgreSQL app preflight
- COS roundtrip
- team invite + Dify mock
- video-chain API smoke
- worker fast-path smoke

仍未通过：

- normal FireRed 带 voiceover 的普通路径。
- 当前卡点是 `generate_voiceover` 里为 `provider=bytedance` 推断 TTS 参数超时。
- Aliyun OSS adapter 未实现。

`.codex/long-task/active.json` 应继续保持 `blocked`。

## 3. 必读文档

先读国内化分支最新证据：

```text
docs/progress/2026-05-16-domestic-clean-release-reproducibility.md
docs/handoff/2026-05-16-domestic-clean-release-handoff.md
docs/progress/2026-05-16-domestic-main-integration.md
docs/handoff/2026-05-16-domestic-main-integration-handoff.md
docs/progress/2026-05-16-domestic-main-integration-audit.md
```

再读主仓产品 / 架构真相源：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/README.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.3-内容日历驱动图文视频生成PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.3.1-中介成员端任务执行与自动成片PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/产品文档/V2.4-内容检索与媒体素材分层路由PRD.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-04-28-current-architecture.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-05-15-选题到内容生成全链路产品总纲.md
```

## 4. 本轮不做什么

不要：

- 实现 Aliyun OSS adapter，除非用户另行明确要求。
- 写 `DOMESTIC_PHASE1_E2E_PASS`。
- 标记 `.codex/long-task` complete。
- push。
- merge 回 `main`。
- 切 `ba-ba-ke.com`。
- 启动 ICP。
- 使用真实敏感用户素材、真实自拍视频、真实声音克隆素材。
- 把 Tencent COS 结果说成 Aliyun OSS 已验证。

可以做：

- 输出 Aliyun OSS adapter 的接口设计和改造清单。
- 继续用 Tencent COS 验证新加坡 self-hosted staging。

## 5. Phase A：自托管产品面兼容矩阵

先产出一份兼容矩阵，不要一上来大改。

目标文档：

```text
docs/progress/YYYY-MM-DD-singapore-selfhost-product-surface-audit.md
```

矩阵至少包含这些产品面：

| 产品面 | 目标 | self-hosted PostgreSQL 状态 | 是否仍依赖 Supabase | 本轮是否要跑 smoke |
| --- | --- | --- | --- | --- |
| owner 登录 / session | app-owned session | 待核 | 待核 | 是 |
| 商家团队 / 邀请码 | owner 邀请成员 | 待核 | 待核 | 是 |
| 成员接受邀请码 | 成员加入团队 | 待核 | 待核 | 是 |
| 内容日历 | 一周任务创建/读取 | 待核 | 待核 | 是 |
| Dify 批量生成 | mock 或真实小样 | 待核 | 待核 | 是 |
| 成员端周任务 | 读取图文/视频脚本 | 待核 | 待核 | 是 |
| 素材上传 | COS 直传 + complete | 待核 | 待核 | 是 |
| 视频工作台 | 创建视频 job | 待核 | 待核 | 是 |
| worker 成片 | fast path + normal no-voiceover | 待核 | 待核 | 是 |
| 结果预览 | 动态重新签名 | 待核 | 待核 | 是 |
| 咨询台 / RAG | 对话、知识检索 | 待核 | 待核 | 审计后决定 |
| 知识库 | 上传/检索/策略资产 | 待核 | 待核 | 审计后决定 |
| 平台管理端 / agent console | 管理配置 | 待核 | 待核 | 审计后决定 |
| 向量检索 | vector / embedding | 待核 | 待核 | 审计后决定 |

输出时不要泛泛说“支持 / 不支持”，要写：

```text
入口 URL/API
依赖 repository
依赖表
依赖 env
本轮是否跑过
失败原因或 blocker
```

## 6. Phase B：周末 self-hosted smoke 套件

在 `http://43.160.208.189` 上继续跑。

### 6.1 必跑主链路

必须覆盖：

```text
owner 登录
owner 创建邀请码
member 接受邀请码
owner 创建一周内容生成 batch
Dify mock run-next 消费
member 端读取一周任务
素材上传到 COS
media complete 写 PostgreSQL
创建 video_edit_jobs
worker fast-path 成片
结果 asset_objects / result_payload 写回
页面或 API 重新签名预览
```

如果有真实 Dify key，可以额外跑一个小样；如果没有，mock 通过即可，不要声称真实 Dify 通过。

### 6.2 normal FireRed 策略

不要继续无边界追 `bytedance` TTS 卡点。

本轮将 normal FireRed 拆成两条：

1. **normal no-voiceover smoke**
   - 目的：验证不是 fast path 的正常 render/upload/preview 链路。
   - production config 显式设置：
     - `voiceover.enabled=false`
     - `bgm.enabled=false` 可选
     - `subtitles.enabled=false` 可选
   - 如果这条通过，说明 normal render 主干可用，只是 TTS/provider 有 blocker。

2. **voiceover/TTS 专项**
   - 目的：定位 `generate_voiceover` 的 provider 配置或参数推断问题。
   - 只在有明确 TTS provider env 和日志证据时继续。
   - 不要把 TTS blocker 阻塞整个 self-hosted staging 测试。

### 6.3 咨询 / RAG / 知识库

用户关心以前稳定的 RAG、向量检索、对话等能力。

本轮先做审计和最小 smoke：

```text
咨询台页面/API 是否能打开
是否还能读取必要商家上下文
是否仍直接依赖 Supabase
知识库上传/检索是否有 PostgreSQL 路径
向量检索是否需要 pgvector 或仍绑定 Supabase
```

如果仍是 Supabase-only，记录为：

```text
暂不属于已经迁移到 self-hosted PostgreSQL 的能力。
需要单独迁移 repository/schema/vector extension。
```

不要为了让 smoke 绿而偷偷接回 Supabase 后声称“已去 Supabase”。

## 7. Phase C：Aliyun OSS 只做设计，不做主实现

输出一份短设计即可：

```text
docs/架构规范/YYYY-MM-DD-storage-provider-adapter-plan.md
```

至少列出：

- 当前 Tencent COS 触点：
  - app upload intent
  - browser SDK direct upload
  - media complete
  - app preview/sign URL
  - worker download input
  - worker upload output
  - smoke scripts
  - env templates
- 目标 provider 接口：
  - `issueUploadCredentials`
  - `createSignedReadUrl`
  - `putObject`
  - `downloadObject`
  - `deleteObject`
  - `roundtripSmoke`
- Aliyun OSS 需要的 env：
  - region
  - bucket
  - endpoint
  - access key id / secret
  - STS role 或 RAM policy
- 数据库 `storage_provider` 取值如何扩展：
  - 保留 `tencent_cos`
  - 新增 `aliyun_oss`
- 哪些测试必须补。

如果用户下周一确定买阿里云 OSS，再进入实现。

## 8. 交付物

完成后至少新增：

```text
docs/progress/YYYY-MM-DD-singapore-selfhost-weekend-product-qa.md
docs/handoff/YYYY-MM-DD-singapore-selfhost-weekend-product-qa-handoff.md
```

如果做了 OSS 设计，再新增：

```text
docs/架构规范/YYYY-MM-DD-storage-provider-adapter-plan.md
```

交付文档必须写清：

- 哪些产品面已经在新加坡 self-hosted 通过。
- 哪些仍依赖 Supabase。
- 哪些只是 mock 通过。
- normal no-voiceover FireRed 是否通过。
- TTS/voiceover blocker 是否还在。
- 是否仍使用 Tencent COS。
- 阿里云 OSS 是否只是设计，未实现。
- long-task 是否仍 blocked。
- push / merge 状态。
- 最终 commit。

## 9. 给下一位 Agent 的一句话

```text
本轮不是做 Aliyun OSS 实现，也不是声明国内完成。
本轮是把新加坡腾讯云服务器作为临时 self-hosted staging，
系统性验证最新 main + domestic 改造后的产品主流程，
并把 Supabase-only / TTS / OSS 风险分层记录清楚。
```

