# 2026-05-15 成片预览与下载入口分离 handoff

## 当前目标

继续 `private-media-dify-full-run` 长任务中的 Worker / OpenStoryline 成片结果切片：把平台内视频预览入口和下载入口分开，避免 `signedPreviewUrl` 同时承担播放和下载。

## 已完成

- 服务端 result asset route 增加 `disposition=inline|attachment` 参数。
- COS 签名 GET URL 支持响应头覆盖：inline 预览、attachment 下载。
- `PublicVideoEditJobDto.resultAssets[]` 支持 `signedDownloadUrl`。
- 成员端、商家视频工作台、草稿视频面板均使用 `<video src={signedPreviewUrl}>` 预览，并用独立按钮链接到 `signedDownloadUrl`。
- 新增/更新单测覆盖成员端状态摘要和公开 DTO 下载 URL 透传。
- 修复项目本地 long-task gate 公共脚本对 UTF-8 / 中文路径输出的处理，避免 `git rev-parse` 在中文 worktree 下产生 mojibake。

## 改动文件

- `.codex/skills/long-task-gate/scripts/common.py`
- `app/src/app/api/video-edit-jobs/[id]/result/[assetId]/route.ts`
- `app/src/components/dashboard/draft-video-panels.tsx`
- `app/src/components/member/member-workspace.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/contracts/media.ts`
- `app/src/lib/member-video-workflow.test.ts`
- `app/src/lib/member-video-workflow.ts`
- `app/src/lib/ui/video-workflow.ts`
- `app/src/server/api/cos.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-job-public-dto.test.ts`
- `app/src/server/api/video-job-public-dto.ts`
- `docs/progress/2026-05-15-video-result-preview-download-separation.md`
- `docs/handoff/2026-05-15-video-result-preview-download-separation-handoff.md`

## 验证结果

- `node --test src/lib/member-video-workflow.test.ts src/server/api/video-job-public-dto.test.ts`：10 passed。
- `./node_modules/.bin/tsc --noEmit`：通过。
- `./node_modules/.bin/eslint`：通过。
- `./node_modules/.bin/next build`：通过。
- `git diff --check`：通过，仅有 Windows CRLF 提醒。

说明：本机未安装 `pnpm` 命令，因此没有直接跑 `pnpm ...`；已使用仓库本地 `node_modules/.bin` 里的等价命令。

## 未完成事项

- 全量 `private-media-dify-full-run` Completion Gate 未完成。
- 真实 COS 预览 / 下载 smoke 未执行；当前为代码合同与本地构建验证。
- Dify fixture 落库、商家私有素材库、Pexels-compatible、个人声音覆盖状态机、worker 私有素材检索等仍需继续按 source goal 推进。

## 分支 / worktree

- Worktree：`D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14`
- 当前状态：未提交，待继续实现 / 验收。

## Push / Merge

- 未 commit。
- 未 push。
- 未 merge。
