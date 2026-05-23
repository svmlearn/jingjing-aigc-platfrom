# Codex Runtime Errors / 当前工作区错误复用库

用途：记录当前工作区内可复用的项目故障诊断、部署处理路径、运行时决策和 runbook。环境、账号、密钥、通用工具链问题仍优先记录到全局库。

## 入口索引

| ID | 关键词 / 现象 | 先做什么 | 状态 | 详情 |
| --- | --- | --- | --- | --- |
| PJ-2026-05-22-001 | `TEAM-*` 邀请码注册时报 `MEMBER_INVITATION_CODE_NOT_FOUND` / “邀请码不存在” | 对比数据库里存储的邀请码格式和 repository 的 normalize 逻辑 | 已解决 | [完整复盘](#pj-2026-05-22-001-member-registration-says-invitation-code-does-not-exist-for-team-codes) |
| PE-20260521-001 | `OpenStoryline stream run timeout after 2700s` / `select_bgm` / `model sampling timed out after 450s` | 查三层日志：`video-worker`、`openstoryline-engine`、`firered-openstoryline`，确认是否卡在 FireRed 内部节点 | 部分解决 | [完整复盘](#pe-20260521-001-openstoryline-stream-2700s-timeout-at-select_bgm) |
| PE-20260522-001 | `/tmp` 运行 ESM 脚本时报 `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` | 临时目录加 `node_modules` 链接到当前 release app，再运行 dry-run | 已解决 | [完整复盘](#pe-20260522-001-temp-esm-script-cannot-resolve-project-dependency) |

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
