# vX.Y Branch Control Board Template

日期：YYYY-MM-DD

## 目标

用一句话写清楚本版本目标。main 是集成分支，worker 分支只负责各自任务。

## 分支状态

| 分支 | 状态 | 依赖 | 最新提交 | 事件 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `codex/vX.Y-foundation` | `planned` | 无 | - | - | foundation 先合 |
| `codex/vX.Y-feature-a` | `planned` | `codex/vX.Y-foundation` | - | - | - |

状态枚举：

- `planned`
- `in_progress`
- `ready_for_review`
- `reviewing`
- `needs_fix`
- `ready_for_recheck`
- `merged`
- `blocked`

## 集成顺序

1. `codex/vX.Y-foundation`
2. `codex/vX.Y-feature-a`

## 返修请求

把 main 发现的问题写成 marker block。worker 分支窗口发“继续”时，hook 会自动注入对应 block。

<!-- codex-branch-fix-start codex/vX.Y-feature-a -->
Status: `needs_fix`
Branch: `codex/vX.Y-feature-a`
Event: `<event-id>`

Main review finding:

- [P1] 说明问题、文件路径、行号和为什么会阻塞合并。

Required fix:

- 明确列出修复要求。
- 修完后重新运行验证并执行 `.codex/scripts/branch-done --handoff <path> --progress <path>`。
<!-- codex-branch-fix-end codex/vX.Y-feature-a -->

## 合并记录

| 分支 | merge commit | 验证 | 结论 |
| --- | --- | --- | --- |
| - | - | - | - |

## 安全边界

- 不自动 push。
- 不自动 apply Supabase migration。
- 不触碰 production。
- staging 写入或部署动作必须由用户明确授权。
