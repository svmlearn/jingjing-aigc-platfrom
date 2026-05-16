# 2026-05-13 COS 运行时间戳与结果对应

本文记录 staging 视频 worker 在腾讯 COS 链路中的运行时间、任务结果、COS 对象和数据库资产记录对应关系。

## 基础信息

- 服务器：`43.160.208.189`
- 工作目录：`/srv/jingjing-video-worker`
- 服务器时区：`Asia/Shanghai (CST, UTC+8)`
- COS bucket：`jj-content-staging-1341668543`
- COS region：`ap-singapore`
- 结果前缀：`video-results`
- 引擎适配器：`fire_red`
- 数据库时间字段原始存储为 UTC；本文时间已换算为北京时间 `CST/UTC+8`。
- 本次排查未回显或写入任何密钥、密码、provider key。

## 容器状态

排查时 `docker compose ps` 显示：

| 服务 | 状态 |
| --- | --- |
| `firered-openstoryline` | `Up`，`healthy` |
| `openstoryline-engine` | `Up`，`healthy` |
| `video-worker` | `Up` |

## 成功任务总览

| Job ID | 输入素材数 | 开始运行 | 引擎完成 | COS 上传完成 | DB 成功时间 | 结果 |
| --- | ---: | --- | --- | --- | --- | --- |
| `6fd28e7b-507c-400a-bee4-c81dd7c37556` | 1 | 2026-05-11 12:52:45 | 2026-05-11 13:02:51 | 2026-05-11 13:02:52.406 | 2026-05-11 13:02:52.473 | 成功，3 个 COS 结果资产 |
| `61ae9626-9d19-4ecd-b671-31ec315eab54` | 3 | 2026-05-13 13:18:32 | 2026-05-13 13:39:47 | 2026-05-13 13:39:49.430 | 2026-05-13 13:39:49.501 | 成功，3 个 COS 结果资产 |
| `8591e620-0526-474e-b0cd-1fbc3e8b0335` | 6 | 2026-05-13 13:39:59 | 2026-05-13 14:06:36 | 2026-05-13 14:06:39.241 | 2026-05-13 14:06:39.319 | 成功，3 个 COS 结果资产 |

## Job `6fd28e7b-507c-400a-bee4-c81dd7c37556`

### 运行时间线

| 时间 | 事件 |
| --- | --- |
| 2026-05-10 22:29:44.368 | `video_edit_jobs.created_at`，任务创建 |
| 2026-05-10 23:15:29.625 | worker 首次领取该任务 |
| 2026-05-10 23:15:29.658 | COS `head object` 检查输入素材 |
| 2026-05-10 23:15:29.911 | COS `get object` 下载输入素材 |
| 2026-05-10 23:45:46.220 | `openstoryline-engine /v1/runs` 返回 `500` |
| 2026-05-10 23:45:46.802 | 任务首次失败，`openstoryline_rendering_failed` |
| 2026-05-11 12:52:45.257 | worker retry 重新领取 |
| 2026-05-11 12:52:45.436 | COS `head object` 检查输入素材 |
| 2026-05-11 12:52:46.033 | COS `get object` 下载输入素材 |
| 2026-05-11 13:02:51.798 | `openstoryline-engine /v1/runs` 返回 `200` |
| 2026-05-11 13:02:52.002 | 开始上传 `final.mp4` |
| 2026-05-11 13:02:52.279 | `final.mp4` 上传完成 |
| 2026-05-11 13:02:52.358 | `cover.jpg` 上传完成 |
| 2026-05-11 13:02:52.406 | `subtitles.srt` 上传完成 |
| 2026-05-11 13:02:52.473 | DB 标记 `succeeded` |

### 输入素材

| Asset ID | COS key | 大小 |
| --- | --- | ---: |
| `e3094353-b974-4b92-bb12-1d11a9e07b67` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/334ae379-f3c6-4838-b2ac-27b396be426e/b7a3405f-432a-4ef2-9d19-51e57f61959a-project-broll-test.mp4` | 2,118,014 |

### COS 结果资产

| 类型 | Asset ID | COS key | 大小 | ETag | COS Last-Modified |
| --- | --- | --- | ---: | --- | --- |
| video | `4f6097a0-666b-49bb-be59-16105cfa268f` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/6fd28e7b-507c-400a-bee4-c81dd7c37556/final.mp4` | 1,000,595 | `"56976e452cb922ee94bdd7c53a35f4ca"` | 2026-05-11 13:02:52 |
| cover | `8373d633-f386-4543-ac6b-286643003cc5` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/6fd28e7b-507c-400a-bee4-c81dd7c37556/cover.jpg` | 42,544 | `"0419378206cb675ec0d05695c603657d"` | 2026-05-11 13:02:52 |
| subtitle | `718b0b63-66e7-4bd0-9fb8-ef7a6e660fec` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/6fd28e7b-507c-400a-bee4-c81dd7c37556/subtitles.srt` | 4,626 | `"5e0ac05066f22f4cf62979c165efcd9a"` | 2026-05-11 13:02:52 |

## Job `61ae9626-9d19-4ecd-b671-31ec315eab54`

### 运行时间线

| 时间 | 事件 |
| --- | --- |
| 2026-05-13 13:18:29.676 | `video_edit_jobs.created_at`，任务创建 |
| 2026-05-13 13:18:32.966 | worker 领取任务 |
| 2026-05-13 13:18:33.201 | COS `head object` 检查输入素材 1 |
| 2026-05-13 13:18:33.827 | COS `get object` 下载输入素材 1 |
| 2026-05-13 13:18:34.045 | COS `head object` 检查输入素材 2 |
| 2026-05-13 13:18:34.064 | COS `get object` 下载输入素材 2 |
| 2026-05-13 13:18:34.241 | COS `head object` 检查输入素材 3 |
| 2026-05-13 13:18:34.258 | COS `get object` 下载输入素材 3 |
| 2026-05-13 13:39:47.801 | `openstoryline-engine /v1/runs` 返回 `200` |
| 2026-05-13 13:39:47.940 | 开始 multipart 上传 `final.mp4` |
| 2026-05-13 13:39:49.323 | `final.mp4` 上传完成 |
| 2026-05-13 13:39:49.389 | `cover.jpg` 上传完成 |
| 2026-05-13 13:39:49.430 | `subtitles.srt` 上传完成 |
| 2026-05-13 13:39:49.501 | DB 标记 `succeeded` |

### 输入素材

| Asset ID | COS key | 大小 |
| --- | --- | ---: |
| `68a75dbb-be40-435a-9a20-634f92b70468` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/0646d743-6975-4865-843a-8ed233620f5d-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `a88c4002-121d-4fcf-963e-35e6a665def3` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/fb47aa2f-f588-4c13-9feb-8076cdb6ee94-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `1cb0978d-50e8-4dc5-a398-c9ff76b0fc2e` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/71e10022-b9c7-4639-902f-342c453f06e0-14280476_1080_1920_30fps.mp4` | 14,550,700 |

### COS 结果资产

| 类型 | Asset ID | COS key | 大小 | ETag | COS Last-Modified |
| --- | --- | --- | ---: | --- | --- |
| video | `347a91e3-c6a0-4619-a8e0-a4a747b84e87` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/61ae9626-9d19-4ecd-b671-31ec315eab54/final.mp4` | 7,994,256 | `"8f1286f41412c3f600cbb2fe637bec98-8"` | 2026-05-13 13:39:48 |
| cover | `939446e1-e137-41f9-b991-5fcb4e19a6d3` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/61ae9626-9d19-4ecd-b671-31ec315eab54/cover.jpg` | 33,657 | `"dfe9829322dfb67a192b49874bc6638b"` | 2026-05-13 13:39:49 |
| subtitle | `041a1b0a-3ce4-46e0-8eee-7e57465f7db5` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/61ae9626-9d19-4ecd-b671-31ec315eab54/subtitles.srt` | 2,331 | `"cb577ffe0ac9f98e8e75b721bb8a63d8"` | 2026-05-13 13:39:49 |

## Job `8591e620-0526-474e-b0cd-1fbc3e8b0335`

### 运行时间线

| 时间 | 事件 |
| --- | --- |
| 2026-05-13 13:22:48.332 | `video_edit_jobs.created_at`，任务创建 |
| 2026-05-13 13:39:59.612 | worker 领取任务 |
| 2026-05-13 13:39:59.698 | COS `head object` 检查输入素材 1 |
| 2026-05-13 13:39:59.723 | COS `get object` 下载输入素材 1 |
| 2026-05-13 13:40:00.375 | COS `head object` 检查输入素材 2 |
| 2026-05-13 13:40:00.392 | COS `get object` 下载输入素材 2 |
| 2026-05-13 13:40:00.986 | COS `head object` 检查输入素材 3 |
| 2026-05-13 13:40:01.006 | COS `get object` 下载输入素材 3 |
| 2026-05-13 13:40:01.704 | COS `head object` 检查输入素材 4 |
| 2026-05-13 13:40:01.720 | COS `get object` 下载输入素材 4 |
| 2026-05-13 13:40:02.402 | COS `head object` 检查输入素材 5 |
| 2026-05-13 13:40:02.419 | COS `get object` 下载输入素材 5 |
| 2026-05-13 13:40:03.124 | COS `head object` 检查输入素材 6 |
| 2026-05-13 13:40:03.140 | COS `get object` 下载输入素材 6 |
| 2026-05-13 14:06:36.783 | `openstoryline-engine /v1/runs` 返回 `200` |
| 2026-05-13 14:06:37.237 | 开始 multipart 上传 `final.mp4` |
| 2026-05-13 14:06:39.149 | `final.mp4` 上传完成 |
| 2026-05-13 14:06:39.209 | `cover.jpg` 上传完成 |
| 2026-05-13 14:06:39.241 | `subtitles.srt` 上传完成 |
| 2026-05-13 14:06:39.319 | DB 标记 `succeeded` |

### 输入素材

| Asset ID | COS key | 大小 |
| --- | --- | ---: |
| `0eff6757-85ec-4c52-8a9d-c7e95eee040c` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/aa9a71fa-cdb4-4a5e-89f4-83f34da896b5-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `68a75dbb-be40-435a-9a20-634f92b70468` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/0646d743-6975-4865-843a-8ed233620f5d-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `720d402f-fd8e-46ab-9ac7-b51151c07730` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/254df2a4-656e-4651-bdd4-92dc68e62e2f-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `a88c4002-121d-4fcf-963e-35e6a665def3` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/fb47aa2f-f588-4c13-9feb-8076cdb6ee94-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `1cb0978d-50e8-4dc5-a398-c9ff76b0fc2e` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/71e10022-b9c7-4639-902f-342c453f06e0-14280476_1080_1920_30fps.mp4` | 14,550,700 |
| `4c2af4fc-99b4-4167-b5dc-544ba9fa33e2` | `draft-inputs/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/e4f08e12-6562-4f15-8f5b-338d75844113/26069cf1-769d-4d05-8be2-8d885fbf4037-14280476_1080_1920_30fps.mp4` | 14,550,700 |

### COS 结果资产

| 类型 | Asset ID | COS key | 大小 | ETag | COS Last-Modified |
| --- | --- | --- | ---: | --- | --- |
| video | `14c2006a-090c-4316-b3e1-53497f86bb4d` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/8591e620-0526-474e-b0cd-1fbc3e8b0335/final.mp4` | 15,956,688 | `"20ad8aaafcf199e8afedc074140091d9-16"` | 2026-05-13 14:06:37 |
| cover | `4a4d9846-6eff-4fbe-a635-43d1dd79c193` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/8591e620-0526-474e-b0cd-1fbc3e8b0335/cover.jpg` | 32,864 | `"9570751d4fa96ee62d7e58745c903f32"` | 2026-05-13 14:06:39 |
| subtitle | `042f4190-b79d-405f-91da-987a1c89162b` | `video-results/e9a7fd77-a305-4b1e-adf7-446a0f93aa4d/8591e620-0526-474e-b0cd-1fbc3e8b0335/subtitles.srt` | 2,331 | `"cb577ffe0ac9f98e8e75b721bb8a63d8"` | 2026-05-13 14:06:39 |

## 失败任务

### Job `da4c4290-747e-4f4c-bd48-baa6b072fadf`

| 字段 | 值 |
| --- | --- |
| 创建时间 | 2026-05-10 22:15:14.568 |
| 领取时间 | 2026-05-10 22:15:19.065 |
| 失败时间 | 2026-05-10 23:15:19.447 |
| 状态 | `failed_retryable` |
| 阶段 | `openstoryline_rendering_failed` |
| 失败原因 | `engine_run_failed: failed to run OpenStoryline engine: timed out` |
| 输入素材 | 0 |
| COS 结果 | 无 |

### Job `7f7c6c92-8cdf-4fd6-b3fa-e9c6d3241564`

| 字段 | 值 |
| --- | --- |
| 创建时间 | 2026-05-13 15:01:02.610 |
| 领取时间 | 2026-05-13 15:01:12.127 |
| 失败时间 | 2026-05-13 16:05:25.771 |
| 状态 | `failed_retryable` |
| 阶段 | `openstoryline_rendering_failed` |
| 失败原因 | `engine_run_failed: failed to run OpenStoryline engine: timed out` |
| 输入素材 | 4 |
| COS 结果 | 无 |

输入素材：

| Asset ID | COS key | 大小 |
| --- | --- | ---: |
| `9a9248b2-ddc2-445f-a813-e9794ab302bf` | `draft-inputs/20718e4e-2853-4dc8-bebe-30c0ace47857/425de44f-586f-47d0-917a-6ae5dfcc78dc/93d350b4-aced-4878-8c43-ae9d0884b4a0-A.mp4` | 6,985,969 |
| `067e91c7-8d87-486b-aa19-73bc54f11551` | `draft-inputs/20718e4e-2853-4dc8-bebe-30c0ace47857/425de44f-586f-47d0-917a-6ae5dfcc78dc/e5529ea4-b183-4c37-91f0-ce0607b34c4b-A.mp4` | 6,985,969 |
| `11dd4f25-add7-4f67-8b9c-4851f33d0306` | `draft-inputs/20718e4e-2853-4dc8-bebe-30c0ace47857/425de44f-586f-47d0-917a-6ae5dfcc78dc/66ebd7a8-8506-4baa-98fc-6fe9ba31da04-A.mp4` | 6,985,969 |
| `9ac89b17-da0d-4210-91f1-b6550569bdb5` | `draft-inputs/20718e4e-2853-4dc8-bebe-30c0ace47857/425de44f-586f-47d0-917a-6ae5dfcc78dc/74c43ba9-3d7a-481e-bd9f-3196c1028824-A.mp4` | 6,985,969 |

## 校验结论

1. `6fd28e7b-507c-400a-bee4-c81dd7c37556`、`61ae9626-9d19-4ecd-b671-31ec315eab54`、`8591e620-0526-474e-b0cd-1fbc3e8b0335` 均完成了：
   - worker 领取任务；
   - 从 COS 下载输入素材；
   - OpenStoryline/FireRed 返回成功；
   - 上传 `final.mp4`、`cover.jpg`、`subtitles.srt` 到 COS；
   - 写入 `asset_objects`；
   - 更新 `video_edit_jobs.status = succeeded`。
2. 9 个成功输出对象均通过 COS `HEAD` 校验，当前对象存在，大小和 `asset_objects.file_size_bytes` 一致。
3. `da4c4290-747e-4f4c-bd48-baa6b072fadf` 和 `7f7c6c92-8cdf-4fd6-b3fa-e9c6d3241564` 为超时失败任务，没有 COS 结果输出。
4. 服务器当前部署日志显示大文件 `final.mp4` 使用 multipart 上传；本地仓库当前代码可能不是服务器运行版本的完全同步状态，判断以服务器日志、数据库记录和 COS HEAD 为准。

