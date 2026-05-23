# Codex Runtime Errors / 当前工作区错误复用库

用途：记录当前工作区内可复用的项目故障诊断、部署处理路径、运行时决策和 runbook。环境、账号、密钥、通用工具链问题仍优先记录到全局库。

## 入口索引

| ID | 关键词 / 现象 | 先做什么 | 状态 | 详情 |
| --- | --- | --- | --- | --- |
| PJ-2026-05-22-001 | `TEAM-*` 邀请码注册时报 `MEMBER_INVITATION_CODE_NOT_FOUND` / “邀请码不存在” | 对比数据库里存储的邀请码格式和 repository 的 normalize 逻辑 | 已解决 | [完整复盘](#pj-2026-05-22-001-member-registration-says-invitation-code-does-not-exist-for-team-codes) |
| PE-20260521-001 | `OpenStoryline stream run timeout after 2700s` / `select_bgm` / `model sampling timed out after 450s` | 查三层日志：`video-worker`、`openstoryline-engine`、`firered-openstoryline`，确认是否卡在 FireRed 内部节点 | 部分解决 | [完整复盘](#pe-20260521-001-openstoryline-stream-2700s-timeout-at-select_bgm) |
| PE-20260522-001 | `/tmp` 运行 ESM 脚本时报 `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` | 临时目录加 `node_modules` 链接到当前 release app，再运行 dry-run | 已解决 | [完整复盘](#pe-20260522-001-temp-esm-script-cannot-resolve-project-dependency) |
| PE-20260524-001 | Windows PowerShell 执行 SSH 发布/修复命令时远端 `grep -E`、here-string、`node --env-file`、root-only env 连续踩坑 | 复杂远端命令改为单引号包裹或脚本 stdin；项目脚本用 `sudo node -- script.mjs --env-file ...` | 已解决 | [完整复盘](#pe-20260524-001-powershell-ssh-server-command-quoting-and-node-env-file-pitfalls) |
| PE-20260524-002 | `video_edit_jobs` 已成功但 `result_payload.local_outputs` 指向不存在的本地目录 | 先验 OSS `result_payload.outputs` / `asset_objects`，本地取件再回退查 FireRed cache 的 `render_video_*/*.mp4` | 部分解决 | [完整复盘](#pe-20260524-002-video-job-succeeded-but-local_outputs-path-is-missing) |

## 快速处理卡

### PJ-2026-05-22-001 Member registration says invitation code does not exist for TEAM codes

- 适用现象：商家团队页显示 active 邀请码，例如 `TEAM-6BB41E8663`，但成员注册时报 `MEMBER_INVITATION_CODE_NOT_FOUND` 或 “邀请码不存在”。
- 先判定：不要先改 auth/cookie/browser state，先对比 `member_invitation_codes` 里的存储格式和 PostgreSQL repository 的 normalize 逻辑。
- 根因：PostgreSQL repository 曾用 `replace(/[^A-Z0-9]/g, "")` 归一化邀请码，导致 `TEAM-6BB41E8663` 被查成 `TEAM6BB41E8663`，无法匹配数据库里的 hyphenated code。
- 修复：`normalizeMemberInvitationCode` 只做 `trim().toUpperCase()`，保留生成的邀请码格式。
- 回归保护：`app/src/lib/db/merchant-repository-domestic-contract.test.ts` 覆盖 PostgreSQL member invite lookup 不剥离 hyphen。

### PE-20260521-001 OpenStoryline stream 2700s timeout at select_bgm

- 适用现象：`video-worker` 报 `failed to run OpenStoryline engine: OpenStoryline stream run timeout after 2700s`。
- 先判定：这不是单纯“服务没启动”。先查 FireRed 日志是否仍在执行、是否出现 `model sampling timed out after 450s`、`unknown request ID`。
- 快速命令：
  1. `sudo systemctl status jingjing-video-worker.service jingjing-openstoryline-engine.service jingjing-firered-openstoryline.service --no-pager -l`
  2. `sudo journalctl -u jingjing-video-worker.service --since '<time>' --no-pager -o short-iso`
  3. `sudo journalctl -u jingjing-firered-openstoryline.service --since '<time>' --no-pager -o short-iso`
  4. `curl -fsS http://127.0.0.1:8000/ready`
- 当前判断：2026-05-21 的失败卡在 FireRed `select_bgm`，内部模型采样 450s 超时，外层 worker 到 2700s 后失败。
- 不要误判：VideoRetalk key 缺失不是这次 2700s 的直接原因；它只影响后续 `lip_sync` 节点。
- 后续处理：新一轮验证必须创建新的 `video_edit_jobs`，不要复用已失败 job 当成功结果。

### PE-20260522-001 temp ESM script cannot resolve project dependency

- 适用现象：把仓库里的 `.mjs` 维护脚本复制到服务器 `/tmp` 运行时，Node 报 `ERR_MODULE_NOT_FOUND: Cannot find package 'pg' imported from /tmp/...`。
- 根因：ESM 裸包导入按脚本所在路径向上解析 `node_modules`，脚本放在 `/tmp` 时不会自动使用 `/srv/jingjing-domestic/current/app/node_modules`。
- 快速处理：在临时目录创建 `node_modules` 符号链接到当前 release 的 app 依赖目录，或把脚本放在 release app 树内运行。
- 推荐命令片段：

```bash
TMP=/tmp/jingjing-factory-fix-$(date +%Y%m%d%H%M%S)
mkdir -p "$TMP/lib"
ln -s /srv/jingjing-domestic/current/app/node_modules "$TMP/node_modules"
node "$TMP/fix-factory-member-video-tasks.mjs"
```

- 验证：同一脚本 dry-run 成功输出 `mode: dry-run`，事务 rollback，没有提交数据库修改。

### PE-20260524-001 PowerShell SSH server command quoting and Node env-file pitfalls

- 适用现象：在 Windows PowerShell 里执行服务器发布、release 验证或数据修复命令时，远端命令被本地 shell 提前解析，出现 `command not found`、`unexpected EOF`、`build\r not found`、`node: /srv/.../app.env: not found`、或 root-only env 读取失败。
- 先判定：这类失败先按“本地 PowerShell 引号/换行/权限问题”排查，不要马上归因到服务器代码或业务脚本。
- 推荐写法：
  - 简短只读命令：`ssh host 'cd /srv/jingjing-domestic/current/app && grep -R -n -E "pattern" file'`，避免在外层双引号里放未转义的 `|`、`(`、`)`。
  - 多行远端脚本：用本地生成 LF/UTF-8 no-BOM 的脚本 stdin 给 `ssh host 'bash -s'`，不要直接把 PowerShell here-string 原样送进 bash。
  - 服务器 root-only env：在 release app 目录内运行 `sudo node -- scripts/name.mjs --env-file /srv/jingjing-domestic/shared/env/app.env`。
  - Node v24 项目脚本：加 `--` 分隔 Node 自身参数和脚本参数，避免 `--env-file` 被 Node 当成内建 env-file 参数解析。
- 避免写法：
  - `sudo -u ubuntu node scripts/name.mjs --env-file /srv/.../app.env`，因为 `app.env` 是 root-only，ubuntu 用户读不到。
  - `node scripts/name.mjs --env-file /srv/.../app.env` 在 Node v24 下可能被 Node 自身抢走 `--env-file`。
  - PowerShell 外层双引号里直接放远端 `grep -E "a|b|c"`、`$(...)`、或复杂 bash 片段。
- 验证：正确命令在 2026-05-24 zhiluan1 脚本修复中 dry-run 和 apply 均输出 JSON，`mode` 分别为 `dry-run` / `applied`。

### PE-20260524-002 video job succeeded but local_outputs path is missing

- 适用现象：`video_edit_jobs.status=succeeded`、`current_stage=completed`，OSS 上传和 `asset_objects` 都已写回，但按 `result_payload.local_outputs.final_video_path` 去服务器取 `/srv/jingjing-video-worker/outputs/jobs/<job-id>/final.mp4` 报 `No such file or directory`。
- 先判定：不要把“本地路径不存在”误判为任务失败。先以 DB 状态、`result_payload.outputs`、`log_payload.steps[].uploaded_assets` 和 `asset_objects` 为准。
- 快速命令：
  1. 查 job：`select status,current_stage,result_payload,log_payload from public.video_edit_jobs where id=$1`
  2. 查资产：`select id,owner_type,owner_id,asset_type,storage_provider,bucket_name,storage_key,file_size_bytes from public.asset_objects where id=any($1::uuid[])`
  3. 找真实本地成片：`find /srv/jingjing-video-worker/firered/.storyline/.server_cache/<session-id> -path '*render_video_*/*.mp4' -type f -printf '%s %p\n'`
- 2026-05-24 验证样例：job `d53fd010-9d7b-4005-a1d1-408ecda0421d` 成功，最终视频资产 `36bad284-81e7-44f2-b6a1-b27b3a5bbbd2`，OSS key `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/d53fd010-9d7b-4005-a1d1-408ecda0421d/final.mp4`，文件大小 `7925028`。
- 取件方式：该次真实本地 mp4 在 FireRed cache：`/srv/jingjing-video-worker/firered/.storyline/.server_cache/5ac1b9d325f240ab9878254cfafdf4a4/render_video_1779559179.9083393/output_4a02a683_1779559179956.mp4`，`ffprobe` 显示 `duration=56.710000`。
- 后续修复：worker 应在成功上传后同步把产物复制到 `result_payload.local_outputs` 指定目录，或改为不写不可用的 local path；验收脚本应优先验证 OSS/asset_objects，不要只依赖 `local_outputs`。

## 完整复盘

### PJ-2026-05-22-001 Member registration says invitation code does not exist for TEAM codes

- Date: 2026-05-22
- Status: solved
- Scope: project, PostgreSQL domestic deployment, member team registration

#### Symptom

- Merchant team page shows active invitation codes such as `TEAM-6BB41E8663`.
- Member registration with a visible team code fails with `MEMBER_INVITATION_CODE_NOT_FOUND` or the UI message "邀请码不存在".
- Team members do not appear after the failed registration attempt.

#### Root Cause

- PostgreSQL repository lookup normalized member invite codes with `replace(/[^A-Z0-9]/g, "")`.
- Generated team invite codes are stored with the hyphen, for example `TEAM-6BB41E8663`.
- Lookup changed the user input to `TEAM6BB41E8663`, so the database query could not match the stored row.

#### Fix

In `app/src/lib/db/postgres-video-chain-repository.ts`, preserve generated hyphenated team code format:

```ts
function normalizeMemberInvitationCode(code: string) {
  return code.trim().toUpperCase();
}
```

#### Verification

```text
node --test src/lib/db/merchant-repository-domestic-contract.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
git diff --check
```

#### Prevention

- Keep generated code format and lookup normalization aligned.
- When a visible invite code fails lookup, first compare stored DB format with repository normalization before changing auth, cookies, or browser state.
- Release this kind of fix through the formal server release directory flow, not by patching `/srv/jingjing-domestic/current` directly.

### PE-20260521-001 OpenStoryline stream 2700s timeout at select_bgm

- 日期：2026-05-21
- 状态：部分解决
- 记录类型：项目故障复盘 / worker runbook
- 影响范围：真实视频 worker 链路，OpenStoryline FireRed 引擎运行
- 最后验证：三服务 active，`/ready` 返回 `engine_adapter=fire_red` 且 provider key configured 为 true

#### 背景

用户报告：

```text
engine_run_failed: failed to run OpenStoryline engine: OpenStoryline stream run timeout after 2700s
```

服务器 `8.154.28.41` 上实际服务不是 Docker Compose 容器，而是 systemd：

```text
jingjing-video-worker.service
jingjing-openstoryline-engine.service
jingjing-firered-openstoryline.service
```

#### 关键证据

- `2026-05-21 18:58:49 CST`：worker claimed job `587fbfee-9e3e-44b1-8c66-b5ca3a378d57`。
- `2026-05-21 19:44:03 CST`：worker 因 OpenStoryline stream 超过 `2700s` 标记失败。
- FireRed 日志显示已执行到 `select_bgm`。
- FireRed 内部出现：

```text
TimeoutError: model sampling timed out after 450s
Received response with an unknown request ID
```

#### 当前结论

这次失败的直接卡点是 FireRed `select_bgm` 的模型采样和 MCP session 超时处理。worker 的 `2700s` 只是外层总等待上限，不代表 VideoRetalk 失败。

#### 处理记录

用户随后提供 VideoRetalk key。该 key 已写入服务器运行时 env，不写入仓库：

```text
/srv/jingjing-domestic/shared/env/worker.env
```

对应变量：

```text
OPENSTORYLINE_LIP_SYNC_PROVIDER=aliyun_videoretalk
ALIYUN_VIDEORETALK_BASE_URL=https://dashscope.aliyuncs.com/api/v1
ALIYUN_VIDEORETALK_API_KEY=<redacted>
ALIYUN_VIDEORETALK_MODEL=videoretalk
ALIYUN_VIDEORETALK_TIMEOUT_SECONDS=900
ALIYUN_VIDEORETALK_POLL_INTERVAL_SECONDS=15
```

修改前备份：

```text
/srv/jingjing-domestic/shared/env/worker.env.bak-videoretalk-20260521204309
```

重启并验证：

```text
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

`/ready` 返回 FireRed ready 且 provider key configured 为 true。

#### 后续建议

1. 下一次验证必须新建 `video_edit_jobs`。
2. 先处理 `select_bgm` 的模型采样超时路径：可考虑确定性 BGM 选择、缩短失败路径、或修复 MCP late response/session 处理。
3. 到达 `lip_sync` 阶段后，再验证 VideoRetalk 是否能拿到 provider-accessible `video_url` / `audio_url`，不能只靠本地文件路径。

### PE-20260522-001 temp ESM script cannot resolve project dependency

- 日期：2026-05-22
- 状态：已解决
- 记录类型：项目部署维护脚本 dry-run
- 影响范围：临时复制到服务器 `/tmp` 的 Node ESM 脚本

#### 现象

为了在不热更新 app 的情况下 dry-run 数据修复脚本，将 `app/scripts/fix-factory-member-video-tasks.mjs` 和 `app/scripts/lib/env-file.mjs` 复制到服务器 `/tmp` 执行。脚本启动前即失败：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from /tmp/jingjing-factory-fix-.../fix-factory-member-video-tasks.mjs
```

#### 根因

`pg` 是项目 app 的依赖。ESM 裸包导入从脚本文件所在目录逐级查找 `node_modules`，而 `/tmp` 目录不在 release app 树下，所以无法解析。

#### 处理方式

在临时目录创建 `node_modules` 符号链接，指向当前 release app 的依赖目录：

```bash
ln -s /srv/jingjing-domestic/current/app/node_modules "$TMP/node_modules"
```

随后继续在 `/srv/jingjing-domestic/current/app` 作为工作目录运行临时脚本，复用当前 release 的依赖，但不修改 release 文件。

#### 验证

重跑 factory member video task dry-run 成功输出：

```text
mode: dry-run
requiredScenes: [1, 5]
bgm.enabled: true
```

脚本未加 `--apply`，事务 rollback，未提交数据库修改。

### PE-20260524-001 PowerShell SSH server command quoting and Node env-file pitfalls

- 日期：2026-05-24
- 状态：已解决
- 记录类型：项目部署 / 服务器维护命令 runbook
- 影响范围：Windows PowerShell 本地终端执行 Aliyun 服务器 release、health check、Node 数据修复脚本

#### 现象

在发布 `5.23-worker-fix` 到 `/srv/jingjing-domestic/releases/20260524011000-182165a` 并从 release 路径运行 zhiluan1 脚本修复时，连续出现几类非业务失败：

```text
sceneAssetQueries\ : The term 'sceneAssetQueries\' is not recognized...
bash: -c: line 1: syntax error near unexpected token `('
bash: line 1: ﻿set: command not found
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "build\r" not found
node: /srv/jingjing-domestic/shared/env/app.env: not found
```

#### 根因

- PowerShell 外层双引号会先处理部分字符，导致远端 `grep -E "a|b|c"` 里的 `|`、括号或嵌套引号被本地 shell 抢先解释。
- PowerShell here-string 传给远端 bash 时可能带 BOM/CRLF，远端看到的是 `﻿set` 和 `build\r`，不是干净的 `set` / `build`。
- Node v24 支持自身的 `--env-file` 参数；执行 `node script.mjs --env-file path` 时，`--env-file` 可能被 Node 当作运行时参数解析，而不是传给项目脚本。
- `/srv/jingjing-domestic/shared/env/app.env` 是 root-only，`sudo -u ubuntu node ... --env-file ...` 不能读取该文件。

#### 正确处理

发布构建用服务器目标用户执行，不把 PowerShell here-string 原样送入 bash：

```bash
ssh meng@8.154.28.41 "sudo -u ubuntu bash -lc 'set -euo pipefail; cd /srv/jingjing-domestic/releases/<release>/app; corepack pnpm@10.20.0 install --frozen-lockfile; corepack pnpm@10.20.0 build'"
```

从已发布 release 路径运行需要读取 root-only app env 的 Node 维护脚本：

```bash
ssh meng@8.154.28.41 "cd /srv/jingjing-domestic/current/app && sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env"
ssh meng@8.154.28.41 "cd /srv/jingjing-domestic/current/app && sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply"
```

复杂只读检查优先用远端单引号包裹，或者写成不含管道的多条简单命令。需要管道、正则和多行脚本时，优先把远端脚本保存为 UTF-8 no-BOM/LF 后通过 `ssh host 'bash -s' < script.sh` 执行。

#### 验证

- 服务器 release `/srv/jingjing-domestic/releases/20260524011000-182165a` 完成 `corepack pnpm@10.20.0 install --frozen-lockfile` 和 `corepack pnpm@10.20.0 build`。
- `sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file ...` dry-run 成功输出 `mode: dry-run`。
- `sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file ... --apply` 成功输出 `mode: applied`。
- `/api/health`、OpenStoryline `/ready`、FireRed `/api/ready` 均返回 ready/ok。

#### 预防

- Windows 上执行服务器命令时，把“本地 shell 解析”和“远端 bash 解析”分开看；失败信息如果出现在 PowerShell 样式报错里，说明命令还没真正进入远端。
- 维护脚本参数和 Node 参数之间加 `--`。
- 读取 `/srv/jingjing-domestic/shared/env/*.env` 时默认按 root-only 处理，不要切到普通运行用户后再读。
- 发布构建失败时先检查 BOM/CRLF、用户权限和 shell quoting，再判断是否是代码构建失败。

### PE-20260524-002 video job succeeded but local_outputs path is missing

- 日期：2026-05-24
- 状态：部分解决
- 记录类型：项目视频 worker 产物验收 runbook / 待修复实现问题
- 影响范围：`video_edit_jobs` 成功后的本地取件、人工验收和后续自动化验收

#### 现象

前端发起的视频任务 `d53fd010-9d7b-4005-a1d1-408ecda0421d` 完整跑通，DB 显示：

```text
status=succeeded
current_stage=completed
progress_pct=100
```

`result_payload.outputs.final_video` 和 `log_payload.steps[].uploaded_assets` 都指向 Aliyun OSS 成片：

```text
video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/d53fd010-9d7b-4005-a1d1-408ecda0421d/final.mp4
```

但按 `result_payload.local_outputs.final_video_path` 拉本地文件失败：

```text
/srv/jingjing-video-worker/outputs/jobs/d53fd010-9d7b-4005-a1d1-408ecda0421d/final.mp4: No such file or directory
```

#### 根因判断

任务本身没有失败，失败的是“本地产物路径记录/复制”：

- `asset_objects` 已有最终视频行：`36bad284-81e7-44f2-b6a1-b27b3a5bbbd2`
- `asset_objects.storage_key` 已写入 OSS final.mp4
- `video-worker` 日志显示 `Completed video job d53fd010-9d7b-4005-a1d1-408ecda0421d`
- FireRed 真实渲染文件存在于 `.storyline/.server_cache/.../render_video_*/*.mp4`
- `/srv/jingjing-video-worker/outputs/jobs/<job-id>/` 目录未生成或未保留

#### 本次可用取件路径

真实成片在服务器 FireRed cache：

```text
/srv/jingjing-video-worker/firered/.storyline/.server_cache/5ac1b9d325f240ab9878254cfafdf4a4/render_video_1779559179.9083393/output_4a02a683_1779559179956.mp4
```

验证结果：

```text
duration=56.710000
size=7925028
```

本地已拉取到：

```text
D:\Desktop\测试素材\jingjing-video-results\d53fd010-9d7b-4005-a1d1-408ecda0421d\final.mp4
```

#### 正确验收顺序

1. 先查 `video_edit_jobs.status/current_stage/progress_pct/failure_*`。
2. 再查 `result_payload.outputs.final_video` 和 `log_payload.steps[].uploaded_assets`。
3. 用 `asset_objects` 验证最终视频资产是否存在，注意当前表没有 `metadata` 字段，不要写 `metadata->>'job_id'` 查询。
4. 只在需要人工拉本地文件时，才从 FireRed cache 查 `render_video_*/*.mp4`。
5. 不要因为 `result_payload.local_outputs` 路径不存在就把成功任务判成失败。

#### 后续修复建议

- worker 成功上传后，将 final/cover/subtitles 同步复制到 `result_payload.local_outputs` 指向的目录；或取消/修正这些不可用路径。
- 自动验收脚本默认以 OSS key、`asset_objects` 和文件大小为成功依据。
- 如果前端只需要成片，前端展示/下载应使用最终视频 asset 或签名 OSS URL，不依赖服务器本地路径。
