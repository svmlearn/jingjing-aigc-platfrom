# 2026-05-15 成片预览与下载入口分离进展

## 目标

落实 `07-测试验收纠错与上线.md` 中 Worker / OpenStoryline 板块的成片结果门禁：

- 平台内成片结果必须能直接预览。
- 下载必须是预览下面的独立按钮。
- `signedPreviewUrl` 和 `signedDownloadUrl` 不得混成同一个“点击就下载”的入口。

本记录只覆盖该切片，不代表 Dify、私有素材库、Pexels-compatible、个人声音覆盖等全量 Completion Gate 已完成。

## 已完成

- `MediaAssetDto` 增加 `signedDownloadUrl`。
- 视频结果 asset app route 支持 `?disposition=inline|attachment`。
- COS 服务端签名支持 `response-content-disposition` 与 `response-content-type`，并保留原 `createCosSignedPreviewUrl` 兼容导出。
- `video_edit_jobs` 对外 DTO 为 COS 成片生成稳定平台内 URL：
  - `signedPreviewUrl`: `/api/video-edit-jobs/{jobId}/result/{assetId}?disposition=inline`
  - `signedDownloadUrl`: `/api/video-edit-jobs/{jobId}/result/{assetId}?disposition=attachment`
- 成员端、商家视频工作台、草稿视频面板从“预览 / 下载共用链接”改为：
  - `<video>` 使用 `signedPreviewUrl`
  - 下载按钮使用 `signedDownloadUrl`
- payload fallback 解析保留 worker 返回的 `signedDownloadUrl` / `downloadUrl` 字段。
- 新增 DTO 回归测试，覆盖显式 `signedDownloadUrl` 保留。

## 验证

- `node --test src/lib/member-video-workflow.test.ts src/server/api/video-job-public-dto.test.ts`
  - 10 passed。
  - Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告，未影响测试结果。
- `./node_modules/.bin/tsc --noEmit`
  - 通过。
- `./node_modules/.bin/eslint`
  - 通过。
- `./node_modules/.bin/next build`
  - 通过。
- `git diff --check`
  - 通过，仅有 Windows CRLF 提醒。

## 未跑通 / 后置

- 本机 shell 没有 `pnpm` 命令，未直接运行 `pnpm typecheck` / `pnpm lint` / `pnpm build`；已使用本地 `node_modules/.bin` 等价命令验证。
- 未做真实 COS 下载 smoke；本切片验证的是 app route、DTO、签名参数和 UI 合同。真实 COS 环境验证仍需在已注入 COS 参数的环境执行。
- 全量 long-task gate 仍处于 active；本切片不是 `PRIVATE_MEDIA_DIFY_FULL_RUN_COMPLETE`。

## 回滚点

若预览或下载入口出现异常，回滚本切片相关文件即可恢复到原先单一 `signedPreviewUrl` 行为。重点文件：

- `app/src/server/api/cos.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/app/api/video-edit-jobs/[id]/result/[assetId]/route.ts`
- `app/src/contracts/media.ts`
- `app/src/server/api/video-job-public-dto.ts`
- `app/src/components/member/member-workspace.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/components/dashboard/draft-video-panels.tsx`
