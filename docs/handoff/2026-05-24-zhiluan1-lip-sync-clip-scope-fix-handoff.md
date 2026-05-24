# 2026-05-24 zhiluan1 lip-sync clip scope fix handoff

## 当前目标

修复任务 `27307400-fbb2-4b8f-8cfa-2a3a8199543b` 对应视频链路里 non-talking-head B-roll 被送入 Aliyun VideoRetalk 的问题。

核心要求：

- 本地先改，不直接热更新。
- 提交并推送到 Gitee 远端分支 `5.23-worker-fix`。
- 后续通过服务器 release 目录发布，不直接改 `/srv/jingjing-domestic/current`。
- 保留本地素材、图片和本次工作文档。

## 已完成

- 已确认两段传入的真人口播素材本身标签正确：
  - `84deb4ca-8893-4c20-b0a0-b98c318e4ae4`
  - `76f79705-b045-4d7f-b34a-b54cae58aa12`
- 已确认 `split_shots` 会切真人口播，但切片后 `talking_head` 标签没有丢。
- 已定位根因：旧 `lip_sync` target 逻辑把“包含 talking_head 的 group”整体扩大为 lip 目标，导致 `group_0006` 内的 `clip_0009` 项目素材进入 VideoRetalk 并触发 `InvalidFile.FaceNotMatch`。
- 已改为 clip/segment 级判断：只有当前 segment/clip 自身是 `talking_head` 才能进入 lip_sync。
- 已增加 provider 调用前防线：非口播片段进入 provider 前会抛出 `lip_sync_non_talking_head_segment_blocked`。
- 已补混合 group 回归测试：`group_0006 = clip_0009 + clip_0011 + clip_0002 + clip_0007` 时，只 retalk `clip_0007`。
- 已写 progress：
  - `docs/progress/2026-05-24-zhiluan1-lip-sync-clip-scope-fix.md`
- 已写项目错误库记录：
  - `docs/codex-runtime-errors.md`
  - 记录 ID：`PE-20260524-004`
- 已更新 skill：
  - `.codex/skills/jingjing-video-edit-run/SKILL.md`

## 本地留档

真人口播输入已留档：

```text
D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_1_asset_84deb4ca_media_0001.mp4
D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_1_frames.jpg
D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_2_asset_76f79705_media_0002.mp4
D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_2_frames.jpg
```

## 当前状态

- 本地工作分支原为 `codex/5.23.1.video-fix`。
- 本次修复原始本地提交为：
  - `e09cfa1 fix: scope lip sync to talking-head clips`
- 推送 `origin HEAD:5.23-worker-fix` 时发现远端 `5.23-worker-fix` 已有更新，非 fast-forward 被拒绝。
- 已把本次提交 rebase 到远端 `5.23-worker-fix` 最新头上。
- 冲突处理原则已执行：保留远端 `5.23-worker-fix` 已有的脚本前推、素材标签、release runbook 等内容，只叠加本次 lip_sync clip 级修复、600 秒参数链路和文档记录。
- rebase 后最终本地提交：
  - `b19578f fix: scope lip sync to talking-head clips`
- push 状态：本地重新验证已通过，待 push。
- server release 状态：待 push 成功后执行。

## 已验证

rebase 前本地已通过：

```text
python -m pytest workers/video-worker/tests/test_firered_lip_sync_node.py
```

结果：

```text
6 passed
```

扩展验证已通过：

```text
cd workers/video-worker
python -m pytest tests/test_directive_contract.py tests/test_firered_lip_sync_node.py
```

结果：

```text
16 passed
```

App 侧相关测试已通过：

```text
cd app
node --test src/server/api/video-workbench-agent-runtime.test.ts src/server/api/video-job-payload.test.ts
corepack pnpm typecheck
```

结果：

```text
25 passed
typecheck passed
```

rebase 后重新验证已通过：

```text
cd workers/video-worker
python -m pytest tests/test_directive_contract.py tests/test_firered_lip_sync_node.py
```

结果：

```text
17 passed
```

```text
cd app
node --test src/server/api/video-workbench-agent-runtime.test.ts src/server/api/video-job-payload.test.ts
corepack pnpm typecheck
```

结果：

```text
30 passed
typecheck passed
```

```text
git diff --check
```

结果：通过，无空白错误。

## 改动文件

本次核心修复：

```text
workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py
workers/video-worker/tests/test_firered_lip_sync_node.py
```

相关参数/合同：

```text
app/src/components/member/member-workspace.tsx
app/src/server/api/schemas.ts
app/src/server/api/video-job-payload.ts
app/src/server/api/video-workbench-agent-runtime.ts
app/src/server/api/video-workbench-agent-runtime.test.ts
workers/video-worker/worker/app/directive.py
```

文档/skill：

```text
.codex/skills/jingjing-video-edit-run/SKILL.md
.codex/skills/jingjing-video-edit-run/agents/openai.yaml
docs/codex-runtime-errors.md
docs/progress/2026-05-24-zhiluan1-lip-sync-clip-scope-fix.md
docs/handoff/2026-05-24-zhiluan1-lip-sync-clip-scope-fix-handoff.md
```

另外工作树中保留远端/前序已有的进展图文改动：

```text
docs/progress/2026-05-21-video-edit-chain-annotatable-map.html
docs/progress/2026-05-22-video-edit-chain-node-map.html
```

## 下一步

1. push 到：

```text
origin 5.23-worker-fix
```

2. push 成功后按 release 流程发布到服务器新 release 目录。
3. release 后重新跑/观察任务 `27307400-fbb2-4b8f-8cfa-2a3a8199543b`，展示：
   - lip_sync target 列表
   - 哪些 talking_head clip 被 retalk
   - 哪些 B-roll 保持原样
   - 最终任务状态和成片/失败原因
