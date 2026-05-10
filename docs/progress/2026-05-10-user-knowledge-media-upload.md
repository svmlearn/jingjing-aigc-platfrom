# 2026-05-10 用户知识库媒体素材上传补强

## 背景

客户进一步明确：用户信息页不需要继续突出“行动目标”，但职业定位、可提供价值、目标对象等信息暂时保留。用户知识库当前已能上传 txt/md，适合承接违禁词文本、销售沟通转写稿、方法论等文本资料；当前缺口是项目图片素材和视频素材上传。

## 本次变更

- 设置页侧栏移除“行动目标”入口，不再展示 CTA 编辑区。
- 用户知识库新增“项目图片/视频素材”上传卡片，支持选择图片或视频文件、填写素材名称和素材说明。
- 新增 `POST /api/materials/project-media`，先创建素材库中的项目媒体素材记录。
- 复用现有 `/api/media/upload-intents` 与 `/api/media/complete`，把浏览器直传 COS 后的文件挂到对应 `source_item`。
- 项目媒体素材保存为素材库记录，后续内容日历、图文工作台、视频工作台仍可从 `/api/materials` 读取。

## 涉及文件

- `app/src/components/merchant/settings-workspace.tsx`
- `app/src/components/merchant/merchant-knowledge-library.tsx`
- `app/src/app/api/materials/project-media/route.ts`
- `app/src/server/api/material-library-service.ts`
- `app/src/server/api/schemas.ts`
- `app/src/lib/ui/video-workflow.ts`

## 验证

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，新路由 `/api/materials/project-media` 已进入 Next route 表。
- 本地 `next dev --port 3000`：启动成功。
- `HEAD /dashboard/settings`：未登录状态按预期 307 到登录页。
- `POST /api/materials/project-media` 未登录请求：返回统一 `UNAUTHENTICATED`，未暴露技术错误。

## 后续建议

- 有登录态后，补一次真实小图/短视频上传冒烟测试，确认 COS 临时凭证、直传、`asset_objects` 写入完整闭环。
- 后续可在素材列表中补缩略图/视频预览，需要从 `asset_objects` 读取签名预览 URL。
