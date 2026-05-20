# 2026-05-20 国内化迁移合并 main 记录

## 背景

用户确认另一个 AI 已基本完成成员端上传素材、AI 剪辑、成片、语音 / ASR 相关改造，希望将国内化迁移分支内容合并到 `main`。

## 涉及分支

主目录：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

集成 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-main-domestic-integration
```

来源分支：

```text
gitee/codex/domestic-infra-migration @ d3ed90f
codex/main-domestic-infra-integration @ e8d8064
```

目标分支：

```text
main
```

## 已完成

1. 在 `codex/main-domestic-infra-integration` 中合入最新 `gitee/codex/domestic-infra-migration`。
2. 在集成分支中合入本机 `main` 既有采购 / 资源记录提交。
3. 在本机 `main` 上先冻结未提交文档状态：

```text
a3fcf3e docs: freeze pre-integration working notes
```

4. 将 `codex/main-domestic-infra-integration` 合并进本机 `main`：

```text
5eeb4ba Merge branch 'codex/main-domestic-infra-integration'
```

## 验证

集成 worktree 验证：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-main-domestic-integration/app
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
```

结果：

```text
pnpm install --frozen-lockfile: pass
pnpm typecheck: pass
pnpm lint: pass
pnpm build: pass
```

主目录 `main` 合并后验证：

```bash
cd /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/app
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
```

结果：

```text
pnpm install --frozen-lockfile: pass
pnpm typecheck: pass
pnpm lint: pass
pnpm build: pass
```

worker / OpenStoryline / FireRed 语法检查：

```bash
cd /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
python3 -m compileall workers/video-worker/worker/app workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline
```

结果：

```text
compileall: pass
```

## 注意事项

本次没有 push 到远端 `gitee/main`。

`docs/其他/` 仍保留为本机未跟踪目录，未纳入 Git。该目录包含备案、证照、身份证、协议草稿等敏感或半敏感材料，不建议直接提交到远端主线。

本次未写入：

```text
DOMESTIC_PHASE1_E2E_PASS
```

原因：尽管链路基本已通，仍建议在最终上线口径明确后再写入正式完成标记。

