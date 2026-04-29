# 2026-04-29 video-workbench-upload-chain handoff

## 当前目标

修通商家侧 `/dashboard/video` 的真实素材上传链，使当前页面不再只是“假上传”，而是能走：

`浏览器 -> /api/media/upload-intents -> COS -> /api/media/complete -> asset_objects(content_draft) -> /api/video-edit-jobs -> worker`

## 已确认事实

### 1. 当前商家视频工作台真实入口

- 页面入口：`app/src/app/dashboard/video/page.tsx`
- 当前挂载组件：`app/src/components/merchant/video-workbench.tsx`

当前商家页面用的是 `VideoWorkbench`，不是已经接了真实上传链的 `DraftVideoPanels`。

### 2. 后端和 worker 能力基本存在

已确认存在：

- `/api/media/upload-intents`
- `/api/media/complete`
- `asset_objects` 落库
- `/api/video-edit-jobs`
- worker 从 `video_edit_jobs.input_payload.input_assets` 拉 COS 素材
- worker 成片/封面/字幕回传 COS 并写 `asset_objects`

关键文件：

- `app/src/server/api/media-service.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/lib/db/media-repository.ts`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/db.py`

### 3. 当前页面原始断点

这轮排查前，`video-workbench.tsx` 里的“传镜头”只是前端假动作，只改本地布尔值：

- 没有调用 `/api/media/upload-intents`
- 没有调 COS SDK 上传
- 没有调用 `/api/media/complete`

因此当前真实断点不是 worker 后半段，而是商家当前页面没有把素材真正归档到 `content_draft` 资产。

### 4. 外部 Cursor 尝试结果

尝试过 2 次：

1. 用 Gitee 仓库调用 Cursor Background Agent  
   结果：Cursor API `400 invalid_argument`

2. 用用户提供的 GitHub 仓库 `https://github.com/zhilihz/cursor_work.git` 调 Cursor  
   结果：agent 状态 `FINISHED`，但目标仓库只有 `README.md`，与当前本地项目不是同一个仓库，因此没有任何有效代码改动。

结论：外部 Cursor 这轮没有改到当前真实代码仓。

## 当前本地未提交改动

当前工作区存在 1 个未提交文件：

- `app/src/components/merchant/video-workbench.tsx`

这份改动来自本轮并行执行结果，已经把当前页面接上了最小真实上传链，核心变化如下：

- 复用 `app/src/lib/ui/video-workflow.ts`
  - `uploadDraftMediaFile()`
  - `loadDraftMediaAssetsFallback()`
  - `persistDraftMediaAssetsFallback()`
  - `formatAssetSize()`
- 原来的“传镜头”按钮改为真实文件选择
- 上传前强校验 `draftBundle.draft.id`，没有脚本草稿时提示“先生成脚本”
- 上传目标固定挂到 `content_draft`
- 新增上传中状态、进度、成功/失败提示
- 新增“当前会话已上传素材”展示区
- 保留无素材也能创建视频任务的 fallback 路径

## 当前未验证项

这份本地改动还没有做完整实证验证。当前还不能宣称链路已彻底打通。需要新线程继续验证以下几点：

1. 浏览器实测  
   验证 `/api/media/upload-intents -> COS -> /api/media/complete` 是否真通

2. Supabase 实查  
   验证是否真的写入 `asset_objects`
   条件应为：
   - `owner_type = content_draft`
   - `owner_id = draftBundle.draft.id`

3. job 输入实查  
   创建 `/api/video-edit-jobs` 后，验证 `video_edit_jobs.input_payload.input_assets` 是否非空

4. worker 实查  
   验证 worker 日志是否真的下载到输入素材，而不是继续走无素材 fallback

5. 结果回写实查  
   验证成片回传 COS 后，`asset_objects(owner_type=content_variant)` 和 `video_edit_jobs.result_payload` 是否回写成功

## 建议下一步

新线程建议按这个顺序执行：

1. 先读本 handoff
2. 看 `git diff -- app/src/components/merchant/video-workbench.tsx`
3. 决定是否保留这份本地未提交改动
4. 安装/确认 `app/` 依赖可运行
5. 启动前端并做浏览器实测
6. 结合 Supabase / worker 状态做链路核验
7. 如果链路仍有断点，再补最小修复

## 改动文件

- `app/src/components/merchant/video-workbench.tsx`

## 分支 / worktree

- 当前分支：`master`
- 当前工作目录：`D:\codexplan\jinging`
- 未使用独立 worktree

## 验证结果

- 已完成代码级排查
- 已完成后端 / worker 路径确认
- 已完成外部 Cursor 可行性排查
- 未完成浏览器上传实测
- 未完成数据库与 worker 运行态验证

## push / merge 状态

- 未 push
- 未 merge
- 当前更适合新线程先验链路，再决定是否整理提交
