# 2026-04-29 商家视频工作台接入真实素材上传链

## 目标

在不改 worker、数据库 schema、后端 API 协议的前提下，把商家当前使用的 `/dashboard/video` 页面从“假上传”接成真实上传：

- 浏览器选择本地图片/视频
- 调用现有 `uploadDraftMediaFile()`
- 通过 `/api/media/upload-intents` + COS 直传 + `/api/media/complete`
- 归档为 `content_draft` 级 `asset_objects`

## 本次改动

涉及文件：

- `app/src/components/merchant/video-workbench.tsx`

主要变更：

1. 复用 `@/lib/ui/video-workflow` 里的：
   - `uploadDraftMediaFile()`
   - `loadDraftMediaAssetsFallback()`
   - `persistDraftMediaAssetsFallback()`
   - `formatAssetSize()`

2. 商家视频工作台新增真实上传状态：
   - `uploadedAssets`
   - `isUploadingAsset`
   - `uploadingSegmentIndex`
   - `uploadProgress`
   - `uploadMessage`

3. 原先镜头表里的“传镜头”按钮不再只改本地布尔值，改为：
   - 选择本地文件
   - 仅在 `draftBundle.draft.id` 存在时允许上传
   - 上传成功后写入当前页素材列表

4. 增加“当前会话已上传素材”区块：
   - 展示当前浏览器会话内已成功归档的素材
   - 明确 owner 目标为 `content_draft`
   - 刷新后先从本地 fallback 恢复

5. 保留现有无素材视频任务 fallback：
   - 未改 `createVideoJob()` 协议
   - 仍允许只靠脚本创建 `video_edit_jobs`

## 没做的事

1. 没补服务端 `draft` 资产列表接口
2. 没改 worker
3. 没改 `video_edit_jobs` schema 或输入协议
4. 没把资产 owner 改为 `content_variant`
5. 没处理“历史草稿恢复后从服务端拉真实素材列表”的完整闭环

## 验证情况

已完成：

- 代码级接线完成
- 一次性 TypeScript CLI 检查至少确认文件可被解析，没有出现语法级报错

未完成：

- 本地项目依赖未安装，无法直接运行仓库内 `eslint` / 完整类型检查
- 未做浏览器实测
- 未实测 Supabase `asset_objects` 写入
- 未实测 `video_edit_jobs.input_payload.input_assets` 是否因上传素材而变为非空

## 剩余风险

1. 当前“已上传素材列表”优先依赖浏览器本地 fallback，不是服务端真实查询结果
2. 单个镜头上传成功后只在该镜头格子标记已上传，未建立镜头与资产的强绑定关系
3. 若后端返回的 `signedPreviewUrl` / `asset` 结构和 `video-workflow.ts` 当前兼容逻辑不一致，前端列表可能只能显示 `storageKey`
