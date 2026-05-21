# 2026-05-19 Main 国内化集成分支 Handoff

本文记录本轮为国内化迁移代码准备 main 集成分支的结果，供后续验收、推送或合并 main 时接手使用。

## 1. 当前目标

为国内化迁移代码准备一个独立集成分支，不直接改动主目录 `main`，先验证代码可以从当前 `gitee/main` 干净承接。

## 2. 分支和 worktree

主项目目录：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

集成 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-main-domestic-integration
```

集成分支：

```text
codex/main-domestic-infra-integration
```

集成基线：

```text
gitee/main @ 5fe5cc5 Merge remote-tracking branch 'gitee/main'
```

已合入来源：

```text
codex/domestic-infra-migration @ f6e4ccf fix: reuse dify video draft for member edits
```

说明：`codex/domestic-infra-migration` 当前比 `gitee/codex/domestic-infra-migration` ahead 1，该本地提交为成员端复用 Dify 视频草稿修复。

## 3. 已完成内容

- 从 `gitee/main` 新建 `codex/main-domestic-infra-integration`。
- 将 `codex/domestic-infra-migration` 快进合入集成分支。
- 合并过程无冲突。
- 当前集成分支包含国内化迁移主体，以及成员端 Dify 视频脚本复用修复：
  - `app/src/components/member/member-workspace.tsx`
  - 提交：`f6e4ccf fix: reuse dify video draft for member edits`

## 4. 本地验证结果

在集成 worktree 内执行：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-main-domestic-integration/app
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
```

结果：

```text
typecheck: pass
lint: pass
build: pass
```

worker / OpenStoryline / FireRed 语法检查：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-main-domestic-integration
python3 -m compileall workers/video-worker/worker/app workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline
```

结果：

```text
compileall: pass
```

未执行完整 worker pytest：新集成 worktree 没有 Python pytest/依赖环境。需要后续复用服务器环境、原 worker 环境，或单独创建 venv 后再跑。

## 5. 尚未完成 / 不要误判

- 未 push `codex/main-domestic-infra-integration`。
- 未 merge main。
- 未写 `DOMESTIC_PHASE1_E2E_PASS`。
- 未确认另一个 AI 正在跑的成员端上传素材到最终成片 E2E 已完成。
- 未把 PWA 改造混入本轮国内化主合并。

## 6. 主目录状态提醒

主项目目录当前 `main` 有既有脏改动和未跟踪文档。本轮没有改动、覆盖或吸收这些内容。

如需最终并入 main，建议以该集成 worktree 为准，在确认 E2E 结果后再决定：

1. 是否追加另一个 AI 的最终 E2E progress/handoff。
2. 是否 push 集成分支给协作者验收。
3. 是否由一个干净集成者执行 main 合并。

## 7. PWA 改造建议

如果成员端后续要做成 PWA，建议作为独立批次处理，不混入本轮国内化集成。

当前代码还没有看到：

- manifest / app manifest
- PWA 图标
- service worker
- 移动端安装元信息
- 成员端独立安装入口文案或安装提示

建议先做轻量 PWA：

1. 成员端 `/member/*` 移动端适配和安全区修正。
2. manifest、图标、theme color、iOS/Android 安装元信息。
3. 登录态、邀请码、任务页、上传素材、AI 剪辑进度在移动端的完整回归。

离线缓存、消息推送、后台上传、失败重试可以放到下一批，避免影响当前已经跑通的在线 AI 剪辑链路。
