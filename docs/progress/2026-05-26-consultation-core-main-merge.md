# 2026-05-26 咨询 Agent 核心集成合入 main 记录

## 背景

用户确认继续后，将已 review 并验证通过的核心集成分支合入本地 `main`。

本轮只合入核心分支：

1. 策略资产结构拆分。
2. 商家资料上下文瘦身。

删除历史记录 reloading 修复分支未纳入本次合入。

## 合入信息

- Main worktree：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- Source branch：`codex/consultation-core-integration`
- Merge mode：`git merge --ff-only codex/consultation-core-integration`
- Merge result：fast-forward，无冲突
- 合入前 main：`b316e79 docs: add consultation next window handoff`
- 合入后 main：
  - `e8d61e7 refactor: split consultation strategy asset contexts`
  - `c4bbb32 refactor: slim consultation merchant profile context`
  - `dc43227 docs: record consultation core integration review`

## Main 验证结果

已通过：

```bash
git diff --check b316e79..HEAD
/opt/homebrew/bin/node --test app/src/server/api/consultation-service.test.ts
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npm run build
```

结果：

- `git diff --check b316e79..HEAD`：通过。
- `/opt/homebrew/bin/node --test app/src/server/api/consultation-service.test.ts`：59 passed，0 failed。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，Next.js production build 成功。

备注：

- 主目录当前 shell 默认 `node` 为 nvm 的 Node `v20.20.2`，直接执行 `.ts` test 会报 `ERR_UNKNOWN_FILE_EXTENSION`。
- 前序 worktree 验证使用 `/opt/homebrew/bin/node v24.4.0`，该版本可直接运行当前 `.ts` test；本轮 main 验证显式使用 `/opt/homebrew/bin/node` 保持一致。
- `node --test` 仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，本轮未处理。
- 主目录 build 读取了既有 `.env.local`，未修改该文件。

## 当前状态

- 本地 `main` 已包含核心集成。
- 本地 `main` 工作区干净。
- 未 push GitHub。
- 未 push Gitee。
- 未 deploy。

## 后续建议

1. 如用户确认上线，再 push `origin main` 和 `gitee main`。
2. push 后按国内自托管流程部署。
3. 部署后至少验证：
   - `/api/health`
   - 商家登录
   - `/dashboard/consultation`
   - 咨询 Agent 历史记录和当前会话可打开
4. reloading 小修复仍在 `codex/consultation-history-delete-loading-fix`，可另行决定是否合入。
