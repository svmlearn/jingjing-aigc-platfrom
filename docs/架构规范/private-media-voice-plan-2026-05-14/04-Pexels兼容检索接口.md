# 04 Pexels-compatible 检索接口

## 摘要

OpenStoryline 看到的是 Pexels-like JSON；我们内部用 `merchant_id + tags + description + 文件元数据` 检索 COS 私有素材。

## 依据

外部依据：

- Pexels API 使用 `GET /v1/search` 搜索图片，返回 `photos`、`page`、`per_page`、`total_results`、`next_page`。
- Pexels API 使用视频搜索 endpoint，返回 `videos` 和 `video_files`。
- GitHub REST API 文档强调大结果集必须分页；本接口沿用 Pexels 的 `page/per_page/next_page` 形式，避免一次返回过多素材。
- GitHub API 的 Link header 经验提醒我们：分页不只是参数，还要让客户端知道是否有下一页；本方案保留 Pexels 的 `next_page`，并可选补充 `Link` header 方便调试。
- Supabase RLS 社区经验要求“不只靠 RLS 过滤”；检索 repository 必须显式 `.eq("merchant_id", merchantId)`。

项目依据：

- OpenStoryline 当前 `search_media.py` 主要消费 `videos[].video_files[].link` 和 `photos[].src.*`。
- 当前方案目标是少改 OpenStoryline，不让它直接理解 COS 或内部标签。

## 专业社区经验落地规则

- 请求和响应外壳模仿 Pexels，召回逻辑使用本地私有标签；两者不能混在一起。
- GitHub 分页实践落成 `page/per_page/next_page + 稳定排序`，不能一次把商家全部素材返回给 OpenStoryline。
- Supabase RLS 经验落成“双过滤”：接口层解析 `merchant_id`，repository 仍显式过滤 `merchant_id`，RLS 兜底。
- COS 文档和业务可用性要求落成“60 天可访问”：返回给 OpenStoryline 的 `link/src` 必须至少 60 天有效，避免出片复查时素材链接已失效。
- 调试字段只允许 staging 或服务端日志使用；生产响应不暴露内部 `tags`、`merchant_id`、COS key。

## 工作边界

视频接口：

```text
GET /api/private-media/pexels/videos/search?query=&per_page=&page=&orientation=&min_video_duration=&max_video_duration=
```

图片接口：

```text
GET /api/private-media/pexels/v1/search?query=&per_page=&page=&orientation=
```

检索顺序：

```text
merchant_id
-> media_type
-> orientation
-> duration range
-> query 命中 tags / description / scene_tags / shot_tags
-> quality_tags
-> created_at desc
```

## 接口合同样例

视频响应保留 Pexels-like 外壳。内部 `tags`、`scene_tags`、`shot_tags` 只参与检索和排序，不返回给 OpenStoryline：

```json
{
  "page": 1,
  "per_page": 10,
  "total_results": 1,
  "videos": [
    {
      "id": "clip_01",
      "width": 1080,
      "height": 1920,
      "duration": 8,
      "image": "https://app.example.com/api/private-media/download/thumb-token",
      "video_files": [
        {
          "id": "clip_01_hd",
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 1080,
          "height": 1920,
          "link": "https://app.example.com/api/private-media/download/video-token"
        }
      ]
    }
  ],
  "next_page": null
}
```

图片响应保留 Pexels-like `photos[].src`。`src.*` 都是 60 天有效下载 URL：

```json
{
  "page": 1,
  "per_page": 10,
  "total_results": 1,
  "photos": [
    {
      "id": "photo_01",
      "width": 1600,
      "height": 900,
      "url": "https://app.example.com/api/private-media/download/photo-page-token",
      "src": {
        "original": "https://app.example.com/api/private-media/download/original-token",
        "large": "https://app.example.com/api/private-media/download/large-token",
        "medium": "https://app.example.com/api/private-media/download/medium-token",
        "portrait": "https://app.example.com/api/private-media/download/portrait-token",
        "landscape": "https://app.example.com/api/private-media/download/landscape-token"
      }
    }
  ],
  "next_page": null
}
```

## 硬门禁

请求门禁：

- 必须有服务端可解析的 `merchant_id` 上下文。
- `per_page` 必须有上限，建议不超过 Pexels 文档中的 80。
- `page` 必须是正整数。
- `orientation` 只接受 `portrait` / `landscape` / 空。
- 未授权请求不得执行检索。
- repository 查询必须显式包含 `merchant_id` 条件。
- query 为空时只能返回当前商家的精选 / 最近素材，不能跨商家兜底。

响应门禁：

- 视频必须返回 `videos[].width`、`height`、`duration`、`video_files[].file_type`、`quality`、`width`、`height`、`link`。
- 图片必须返回 `photos[].width`、`height`、`src.original`，并尽量补齐 `large2x`、`large`、`medium`、`portrait`、`landscape`。
- `link` / `src.*` 必须是 60 天有效下载 URL；优先返回平台下载 token URL，必要时由下载入口重新签 COS。
- 无结果返回空数组，不返回 500。
- 不得返回其他 `merchant_id` 素材。
- 返回结果必须稳定排序，避免同一页翻页重复或漏项。
- 下载 URL 签发失败的素材不得出现在结果中。
- 生产响应不得返回内部标签、COS key、bucket、`merchant_id`；需要排查时写入服务端日志或 staging debug header。

## 检查功能

契约检查：

- 用固定 fixture 检查视频 JSON 是否满足 OpenStoryline 当前字段需求。
- 用固定 fixture 检查图片 JSON 是否满足 OpenStoryline 当前字段需求。
- 检查 `next_page` 是否只在仍有下一页时出现或非空。
- 检查可选 `Link` header 是否和 `next_page` 一致。
- 检查生产响应不含内部 `tags`、`cos_key`、`bucket_name`、`merchant_id`。

权限检查：

- A merchant 查询 A 素材成功。
- B merchant 查询 A 素材为空或 403。
- 未登录 / 无 token 查询失败。

稳定性检查：

- 同一 query、page、per_page 在无数据变更时结果稳定。
- 大量素材时不会一次返回全部。
- 60 天下载 URL 过期后不可访问。
- 同一素材在连续页中不重复出现。

## 纠错功能

- 响应字段缺失：契约测试失败，禁止合并。
- 下载 URL 签发失败：该条结果跳过，并记录 `sign_download_url_failed`。
- query 无结果：返回空数组，同时记录 missing query 供后续补素材。
- 误召回：记录 negative feedback，降低该 clip 对类似 query 的排序。
- OpenStoryline 下载失败：标记 clip `download_failed_recently`，短期降权。
- 翻页重复：锁定排序字段，优先使用 `score desc, created_at desc, id asc`。

## 板块验收

- OpenStoryline 不配置真实 Pexels key，也能通过私有接口下载素材。
- 视频和图片接口都通过契约测试。
- 跨商家请求不会返回素材。
- 分页、空结果、60 天 URL 过期都有明确行为。
