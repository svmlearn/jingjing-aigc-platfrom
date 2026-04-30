# 2026-04-28 M 同学视频工作分支集成 handoff

## 当前目标

把 M 同学 Gitee 分支 `孟_4.28_video-work` 安全合入一个独立集成分支，先完成 Git 层面合并和最小本地验证，不直接合并回 `main`。

## 分支与工作区

- 本地主目录：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- 本地 `main` 基线提交：`b263b5e chore: freeze local collaboration baseline`
- M 同学远端分支：`gitee/孟_4.28_video-work`
- M 同学远端提交：`49cc7a2 docs: record video work gitee integration`
- 集成分支：`codex/integrate-m-video-work`
- 集成 worktree：`/Users/wy/.codex/worktrees/integrate-m-video-work`
- 合并提交：`edee201 merge: integrate M video work branch`

## 已完成内容

1. 先在本地 `main` 冻结当前协作基线：
   - 提交：`b263b5e chore: freeze local collaboration baseline`
   - 包含长任务门禁 skill、需求池、热点抓取待验证事项、登录闪退/COS/CAM 相关记录。
2. 安全处理了 `docs/progress/2026-04-28-tencent-cloud-mdeploy-access.md`：
   - 删除明文临时密码。
   - 保留账号入口、服务器入口和操作步骤。
   - 后续密码只能走私下渠道或现场重置，不进 Git。
3. 新建独立集成分支 `codex/integrate-m-video-work`。
4. 合入 `gitee/孟_4.28_video-work`。
5. 解决唯一 Git 冲突：
   - 冲突文件：`docs/README.md`
   - 处理方式：采用 M 同学的 `2026-04-28-current-architecture.md` 作为当前架构入口，同时保留本地新增的 `需求池.md` 和热点抓取待验证事项入口。
6. 产出合并提交：
   - `edee201 merge: integrate M video work branch`

## 合入的主要范围

### app

- 视频工作台生产链路增强。
- 视频脚本 production agent。
- 视频脚本 revision / test draft API。
- content variant approve API。
- video job payload / growth context / chain test draft 相关服务和测试。
- 新增 migration：`app/supabase/migrations/202604280001_script_production_agent_settings.sql`。

### worker

- `workers/video-worker` 增加真实 OpenStoryline / FireRed Docker 路径。
- 增加 worker directive、payload 校验、输出资产写回、poller/processor contract tests。
- vendor 了 `workers/video-worker/openstoryline/firered/`。

### docs

- 新增当前架构总说明：`docs/架构规范/2026-04-28-current-architecture.md`。
- `AGENTS.md` 和 `docs/README.md` 已转向当前架构总说明。
- M 分支删除了两份旧架构文档：
  - `docs/架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md`
  - `docs/架构规范/2026-04-25-AI视频图文数据与系统架构补充决策.md`

这两个删除目前保留在集成结果里，因为 M 分支已用 `2026-04-28-current-architecture.md` 收敛架构入口。是否需要把旧文档改为 archive 保留，建议由 W 同学确认。

## 本地验证结果

在集成 worktree 中已执行：

```bash
cd /Users/wy/.codex/worktrees/integrate-m-video-work/workers/video-worker
PYTHONPATH=. pytest -q
```

结果：

```text
46 passed
```

在 app 中已执行：

```bash
cd /Users/wy/.codex/worktrees/integrate-m-video-work/app
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
```

结果：

- `pnpm install --frozen-lockfile`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，Next.js 生产构建成功。

## 尚未完成

- 未把 `codex/integrate-m-video-work` 合并回 `main`。
- 未 push 到 GitHub 或 Gitee。
- 未 apply `202604280001_script_production_agent_settings.sql` 到 staging Supabase。
- 未部署 Vercel staging。
- 未在真实 staging 环境跑商家端全链路验收。
- 未用真实 worker / COS / FireRed / LLM 密钥跑端到端视频任务。

## 下一步建议

1. W 同学先确认是否接受 M 分支把旧架构文档替换为 `2026-04-28-current-architecture.md`。
2. 检查 `workers/video-worker/openstoryline/firered/` vendor 进仓库是否符合体积、许可证和维护预期。
3. 在 staging Supabase apply 新 migration，并记录到 `docs/progress/2026-04-25-supabase-migration-current-state.md` 或新增 progress。
4. 部署集成分支到 staging 预览环境。
5. 跑最小验收链路：
   - 商家登录。
   - 咨询 Agent 对话。
   - 内容日历进入视频工作台。
   - 生成视频脚本。
   - 确认脚本和素材。
   - 创建 `video_edit_jobs`。
   - worker 消费任务并回写结果。
   - app 预览成片和修订入口。

## 当前状态

状态：`待 W 同学验收 / 待合并决策`

push / merge：均未执行。
