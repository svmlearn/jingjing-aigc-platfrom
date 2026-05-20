# 2026-05-19 国内化迁移当前上下文 Zero-Memory Handoff

本文给下一位接手的 AI / Codex 使用。目标是让下一轮对话不依赖聊天记录，也能继续协助 W 同学推进国内化迁移、阿里云部署、Dify 团队内容链路和后续 TTS/ASR 收口。

## 1. 当前总判断

国内化主体迁移已经基本完成，阿里云上已经跑通：

```text
app
-> 阿里云 RDS PostgreSQL
-> 阿里云 OSS
-> worker
-> OpenStoryline / FireRed
-> normal no-voiceover 视频生成
-> final asset 写入 video-results/*
-> preview/download 200
```

但还不能宣称“正式上线完成”，因为仍有上线级收口项：

- TTS / voiceover 未验证。
- ASR / SASR 未迁移。
- RDS SSL 未完成，当前 Phase 1 私网口径使用 `sslmode=disable`。
- Docker 镜像可复现部署未完成，当前 worker / FireRed 多处使用 venv + systemd。
- DNS / HTTPS / ICP 尚未接入。
- `main` 尚未合并。
- 禁止写入 `DOMESTIC_PHASE1_E2E_PASS`，除非用户明确授权且 gate 条件满足。

## 2. 关键工作区和分支

主项目目录：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

国内化迁移 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

迁移分支：

```text
codex/domestic-infra-migration
```

远端：

```text
gitee/codex/domestic-infra-migration
```

截至 2026-05-19 中午前后，已确认最新同步基线曾为：

```text
e2758df fix: return on dify streaming terminal event
```

如果接手时请先执行：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
git fetch gitee --prune
git checkout codex/domestic-infra-migration
git status -sb
git log --oneline --decorate -8
```

如果 worktree 不 clean，先询问或汇报，不要覆盖用户或其他 AI 的改动。

## 3. 阿里云资源现状

ECS：

```text
实例 ID: i-bp190gb0a3ajywl6urzk
公网 IP: 8.154.28.41
内网 IP: 172.27.156.22
系统: Ubuntu 22.04
规格: 8C16G
```

访问入口：

```text
http://8.154.28.41
```

RDS PostgreSQL：

```text
实例 ID: pgm-bp1p28yc1u41re78
库名: jingjing_domestic
业务用户: jingjing_app
内网 host: pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
port: 5432
当前连接风险: Phase 1 私网 sslmode=disable
```

OSS：

```text
bucket: jingjing-domestic-phase1-hz
region: oss-cn-hangzhou
endpoint: oss-cn-hangzhou.aliyuncs.com
ACL: private
阻止公共访问: enabled
正式视频结果 prefix: video-results/*
```

RAM policy 已补最小权限：

```text
source-assets/*
draft-inputs/*
knowledge/*
video-results/*
app-storage-provider-smoke/*
```

不要扩大到整 bucket，除非用户明确授权。

## 4. 当前服务器部署口径

阿里云部署目录：

```text
/srv/jingjing-domestic/releases
/srv/jingjing-domestic/current
/srv/jingjing-domestic/shared/env/app.env
/srv/jingjing-domestic/shared/env/worker.env
/srv/jingjing-domestic/backups
```

当前已知冻结 release：

```text
/srv/jingjing-domestic/releases/20260519013445-52ce51d
```

后续可能已有新 release，请接手后以服务器实际 `readlink -f /srv/jingjing-domestic/current` 为准。

systemd 服务名：

```text
jingjing-domestic-app.service
jingjing-firered-openstoryline.service
jingjing-openstoryline-engine.service
jingjing-video-worker.service
nginx
```

常用健康检查：

```bash
curl -fsS http://8.154.28.41/api/health
ssh ubuntu@8.154.28.41 'systemctl is-active nginx jingjing-domestic-app.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service'
```

不要打印 `/srv/jingjing-domestic/shared/env/*.env` 的值，只能汇报字段名或 SET/MISSING。

## 5. 已完成的重要批次

### 5.1 PostgreSQL / repository / app 基础迁移

已完成：

- platform admin session。
- consultation / strategy。
- knowledge repository。
- agent runtime / admin writes。
- platform admin management。
- import repository。
- material library。
- merchant credits / usage。
- P0 foundation schema。

相关 migration 已进入 `app/db/migrations/`。

### 5.2 Aliyun OSS adapter

已完成：

- storage provider abstraction。
- Tencent COS 兼容保留。
- Aliyun OSS SDK 接入。
- signed PUT。
- browser upload route。
- OSS roundtrip。
- signed PUT/CORS 真实验证。

### 5.3 App-only clean release

已完成：

- app 已在 ECS 上运行。
- Nginx 80 反代到 app 端口。
- `/api/health` 返回 `postgres + aliyun_oss`。
- app preflight / platform admin / consultation / strategy / knowledge / material / import / credits smoke 通过。

### 5.4 Worker / FireRed / OpenStoryline

已完成：

- Aliyun OSS app/worker storage contract。
- worker fast-path。
- official `video-results/*` prefix。
- 集成 Meng 同学 worker real-run hardening。
- FireRed real runtime 启动。
- normal no-voiceover job 成功。
- preview/download 200。

最近成功证据之一：

```text
job id: 8ef8df13-0406-4ab3-a7bd-c876b37b206a
final asset id: 2670477e-477e-4b84-8cfa-a7415f6fbdd7
final key: video-results/f271bac6-3bed-4078-ac60-4a72c17c47df/8ef8df13-0406-4ab3-a7bd-c876b37b206a/final.mp4
preview: 200
```

### 5.5 产品 QA 账号

PM QA 账号凭证只保存在本机：

```text
/tmp/jingjing-aliyun-product-qa-account.env
```

不要把凭证写入聊天或文档。

### 5.6 App runtime env

已迁移到阿里云 app env 的字段包括：

```text
SILICONFLOW_API_KEY: SET
DIFY_BASE_URL: SET
DIFY_WORKFLOW_RESPONSE_MODE: SET
DIFY_WORKFLOW_TIMEOUT_SECONDS: SET
TIKHUB_BASE_URL: SET
```

当时缺失：

```text
DIFY_API_KEY
LLM_API_KEY
OPENAI_API_KEY
APIFY_TOKEN
TIKHUB_API_KEY
```

后续用户/AI 已开始补 Dify 真实验证，请接手后重新检查 `DIFY_API_KEY` 是 SET 还是 MISSING，只汇报状态，不打印值。

## 6. 当前最重要的产品链路

当前产品主链路应按 V2.3.1：

```text
owner 团队选题 / 咨询
-> 内容日历
-> 生成团队本周内容
-> Dify 为成员生成图文包和视频镜头脚本
-> 成员端查看今日任务
-> 成员上传自拍 / 素材
-> AI 剪辑
-> 成片预览 / 下载
```

关键判断：

成员端如果已经有 Dify 写回的 `generatedVideoScript`、`contentDraftId`、`contentVariantId`，点击 AI 剪辑时应直接复用 Dify 生成脚本创建 `video_edit_job`。

不应该再调用旧的：

```text
/api/content/video-workbench-agent
```

旧 `video-workbench-agent` 只应保留给 `/dashboard/video` 手动创作入口，或没有 Dify 脚本时 fallback。

这是当前最后一段产品链路修复的核心。

## 7. 当前正在交给另一个 AI 的任务

用户刚要求给另一个新窗口 AI 一个零上下文任务书。任务目标是：

```text
修复成员端 Dify 生成脚本 -> AI 剪辑衔接
```

具体要求：

- 审计 `app/src/components/member/member-workspace.tsx`。
- 重点看：
  - `startAiEdit`
  - `createVideoDraftFromTask`
  - `approveVariantIfNeeded`
  - `createVideoEditJob`
- 如果 `task.videoTask.generatedVideoScript` 存在，并且 `task.videoTask.contentDraftId / contentVariantId` 存在：
  - 不调用 `createVideoDraftFromTask`
  - 不调用 `/api/content/video-workbench-agent`
  - 直接使用 Dify 写回 draft/variant 创建 `video_edit_job`
- 只有 Dify 写回缺失时才 fallback 旧 Agent。
- 验证成员端上传素材后 FireRed normal no-voiceover 成功，final asset 在 `video-results/*`，preview/download 200。

如果下一轮对话开始时，用户说“那个 AI 做完了”，请优先核查：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
git fetch gitee --prune
git log --oneline --decorate -12 gitee/codex/domestic-infra-migration
git status -sb
```

并让用户贴结果或直接审计最新 progress/handoff。

预期新增文档：

```text
docs/progress/2026-05-19-aliyun-member-dify-script-to-video-e2e.md
docs/handoff/2026-05-19-aliyun-member-dify-script-to-video-e2e-handoff.md
```

## 8. 需要继续验证的功能清单

按优先级：

1. Dify 真实团队内容生成 E2E：
   - owner 点击“生成团队本周内容”。
   - batch 创建。
   - jobs 消费完成。
   - `daily_content_tasks` 写回 Dify 图文包和视频脚本。

2. 成员端 Dify 脚本到剪辑：
   - `/member/calendar` 能看到任务。
   - `/member/video/:taskId` 展示 Dify 脚本。
   - 点击 AI 剪辑不调用 video-workbench-agent。
   - 上传素材到 Aliyun OSS。
   - `video_edit_job` succeeded。
   - final key 在 `video-results/*`。
   - preview/download 200。

3. 团队成员邀请：
   - owner 创建邀请码。
   - 成员接受邀请码。
   - 成员加入同一 merchant/team。
   - 成员内容和视频任务归属成员自己，不能串号。

4. TTS / voiceover：
   - 另一个研发同学准备基于当前分支开发。
   - 应基于 `gitee/codex/domestic-infra-migration`，不要基于 `main`。
   - 不要破坏 no-voiceover 已通链路。

5. ASR / SASR：
   - 还未迁移。
   - 用户提到可能走 SASR 账号/接口。

6. RDS SSL：
   - 当前不是简单确定改一行。
   - 需要确认阿里云 RDS SSL 开关、证书和连接串。

7. Docker 可复现部署：
   - 当前 Docker Hub 拉镜像曾超时。
   - Phase 1 使用 systemd + venv。
   - 后续需要镜像/registry mirror/可复现构建。

8. DNS / HTTPS / ICP：
   - ba-ba-ke.com 备案和域名接入尚未做。
   - 当前可用 IP 访问。

## 9. 给研发同学的当前基线建议

如果另一个研发要做 TTS/ASR：

```bash
git fetch gitee
git checkout -b codex/tts-asr-domestic gitee/codex/domestic-infra-migration
```

提醒他：

```text
请基于 gitee/codex/domestic-infra-migration 最新代码开发，不要基于 main。
不要回退 Aliyun OSS / PostgreSQL / worker storage contract。
不要恢复 Supabase / COS / Vercel 假设。
不要破坏 normal no-voiceover 已通链路。
TTS/voiceover 请单独 commit，并补 smoke/test。
如果需要 env，只写字段名和文档，不提交真实 key。
改完至少跑 worker tests、compileall、app typecheck/lint/build，以及阿里云 normal no-voiceover 回归。
```

## 10. 重要禁止事项

在用户未明确授权前：

- 不 merge main。
- 不 push 到 main。
- 不写 `DOMESTIC_PHASE1_E2E_PASS`。
- 不标 long-task complete。
- 不打开 RDS 公网。
- 不关闭 OSS 私有或公共访问阻止。
- 不扩大 RAM policy 到整 bucket。
- 不打印任何 secret。
- 不把 Vercel/Supabase/COS 旧 env 整份复制到阿里云。
- 不把 worker output prefix 改回 smoke 临时路径。
- 不把成员端主路径改回 `/dashboard/video`。

## 11. 常用安全检查命令

查看阿里云 app 健康：

```bash
curl -fsS http://8.154.28.41/api/health
```

查看服务状态：

```bash
ssh ubuntu@8.154.28.41 'systemctl is-active nginx jingjing-domestic-app.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service'
```

只看 env 字段名：

```bash
ssh ubuntu@8.154.28.41 'sudo sed -n "s/^\\([A-Za-z0-9_][A-Za-z0-9_]*\\)=.*/\\1/p" /srv/jingjing-domestic/shared/env/app.env | sort -u'
```

只看某字段是否 SET/MISSING，不打印值：

```bash
ssh ubuntu@8.154.28.41 'sudo awk -F= '\''$1=="DIFY_API_KEY"{print $1 "=" (length($2)>0 ? "SET" : "MISSING")} '\'' /srv/jingjing-domestic/shared/env/app.env'
```

查看当前 release：

```bash
ssh ubuntu@8.154.28.41 'readlink -f /srv/jingjing-domestic/current'
```

## 12. 新对话接续方式

如果用户问“现在下一步怎么办”，优先判断：

1. 另一个 AI 是否完成 `member Dify script -> AI edit` 修复。
2. 如果完成，先校验最新 commit / docs / 阿里云 E2E 证据。
3. 如果没完成，继续推进该任务，不要跳到 TTS/ASR。
4. 如果完整 E2E 已通，再建议下一阶段：
   - TTS/voiceover 独立批次。
   - ASR/SASR 独立批次。
   - RDS SSL。
   - HTTPS/域名/ICP。
   - Docker 可复现部署。
   - 最终 main 集成计划。

核心提醒：

```text
国内化基础设施和 no-voiceover 视频链路已经通了。
当前最关键的是让 V2.3.1 的真实产品主链路闭合：
团队内容日历 -> Dify -> 成员任务 -> 上传素材 -> AI 剪辑 -> 成片。
```
