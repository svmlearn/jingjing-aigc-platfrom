# 2026-04-28 视频链路测试入口补充

## 目标

让产品同学可以在没有真实匹配脚本素材的情况下，自行验证视频上传、生成、预览和制作修订链路。

## 结论

本轮没有绕开 `video_edit_jobs` 合同，也没有放松正式任务创建条件。

新增方式是创建一个“已确认的视频脚本测试草稿”，让后续仍然走：

```text
content_drafts / content_variants
-> draft 素材上传
-> video_edit_jobs
-> worker
-> result preview
-> sourceJobId 制作修订
```

## 使用方式

本地开发默认可用：

```text
/dashboard/video?testMode=video_chain
```

进入后点击顶部“创建测试脚本”，再上传任意图片或视频素材，点击“AI 一键剪辑”。

staging 如果以 `NODE_ENV=production` 构建，需要显式配置：

```text
VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=true
```

生产环境默认关闭。

## 改动文件

- `app/src/server/api/video-chain-test-draft.ts`
- `app/src/server/api/video-chain-test-draft.test.ts`
- `app/src/app/api/content/video-scripts/test-draft/route.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/components/merchant/video-workbench.tsx`

## 验证

- `node --test src/server/api/video-chain-test-draft.test.ts`
- `node --test src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm build`

## 风险和边界

- 测试入口只跳过脚本生成，不跳过素材上传、任务创建和 worker 合同。
- 测试模式下无 `sessionId`，聊天框只用于成片后的制作修订；语义脚本修订仍需要真实咨询上下文。
- 当前主工作区已有大量既有未提交改动，本轮未做合并、提交或 push。
