# 2026-05-26 5.26-worker-fix 合并到 main

## 1. 目标

将 Gitee 分支 `5.26-worker-fix` 合并到本地 `main`，确认无冲突并完成双远端同步。

本轮不执行服务器 release。

## 2. 合并前状态

本地 `main` 先提交了素材标签与手动打标归档：

- `f4c9f84 docs: add barbecue media tagging standards`

随后从当前 `main` 新建集成分支：

- `codex/integrate-5.26-worker-fix-20260526`

远端分支：

- `gitee/5.26-worker-fix`

## 3. 合并结果

集成分支合并成功，无冲突：

- `6ef85bb Merge gitee/5.26-worker-fix into main`

合并后将集成分支 fast-forward 回本地 `main`。

主要引入内容包括：

- 成员视频任务恢复相关修复
- 私有媒体 token / Qwen37 secret 相关 release 记录
- `zhiluan1` factory script 检索与批量修复
- video-worker 私有素材检索 base URL、FireRed node interceptor、processor contract 相关更新

## 4. 验证

App 侧 contract 验证：

```bash
cd app
node --test src/server/api/video-job-public-dto.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/components/member/member-workspace-contract.test.ts
```

结果：

- 20 tests passed
- 0 failed

Worker 侧验证：

```bash
cd workers/video-worker
python -m pytest tests/test_processor_contract.py tests/test_firered_node_interceptors.py tests/test_firered_search_media_private_base_url.py tests/test_firered_group_clips_contract.py -q
```

结果：

- 94 passed

TypeScript 验证：

```bash
cd app
pnpm exec tsc --noEmit --incremental false
```

结果：

- passed

## 5. 推送

已推送：

- `gitee main`
- `origin main`

推送前确认本地 `main` 相对 `gitee/main`、`origin/main` 只有本地领先提交，没有远端独有提交。

## 6. 状态

状态：`5.26-worker-fix` 已合入本地 `main`，并已同步到 Gitee 与 GitHub。

服务器 release：未执行。

置信度：高。
