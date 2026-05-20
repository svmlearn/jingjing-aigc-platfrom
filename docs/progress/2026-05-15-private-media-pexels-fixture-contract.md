# 2026-05-15 Pexels-compatible 私有检索 fixture 合同进展

## 目标

落实私有素材检索核心门禁：

- repository / adapter 查询必须显式带 `merchant_id`。
- 只返回当前商家的 ready 素材。
- `per_page` 有上限，分页稳定且连续页不重复。
- 视频返回 `videos[].video_files[].link`。
- 图片返回 `photos[].src.*`。
- 生产响应不暴露 `merchant_id`、COS key、bucket、内部 tags。
- 返回给 OpenStoryline 的下载入口必须满足 60 天有效期要求。

## 已完成

- 新增纯 adapter：`app/src/lib/private-media-pexels-adapter.ts`。
- 新增 fixture contract tests：`app/src/lib/private-media-pexels-adapter.test.ts`。
- 本地 fixture 覆盖：
  - `merchantId` 显式过滤。
  - `status = ready` 过滤；`tagging_failed` 不参与检索。
  - query 命中 description / tags / scene tags / shot tags。
  - 空 query 只返回当前商家 ready 素材，不跨商家兜底。
  - `per_page` 最大截断到 80。
  - `next_page` 只在有下一页时出现。
  - 连续 page 不重复。
  - 视频 Pexels-like JSON 满足 OpenStoryline `videos[].video_files[].link` 消费字段。
  - 图片 Pexels-like JSON 满足 `photos[].src.original/large/medium/portrait/landscape`。
  - 响应 JSON 不包含 `merchantId`、`bucketName`、`cosKey`、`merchant-media/`、`tags`、`sceneTags`。
  - signer 返回不足 60 天有效期时，该素材不进入结果。

## Mock / Real 说明

- 下载 URL：本切片使用 mock signer 生成 `/api/private-media/download/...` 形态 URL，并校验 `expiresAt >= now + 60 days`。
- COS：未签真实 COS URL，未访问真实 bucket。
- Supabase / DB：未依赖 Supabase app keys 或 service role；用 fixture clip records 验证业务合同。
- OpenStoryline：未调用真实服务；当前验证 Pexels-like JSON 字段外壳和私有字段脱敏。

## 验证

- `node --test src/lib/private-media-pexels-adapter.test.ts`
  - 5 passed。
  - Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告，未影响测试结果。
- `./node_modules/.bin/tsc --noEmit`
  - 通过。

## 未完成 / 后置

- 已在后续 route fixture 切片新增 `/api/private-media/pexels/v1/search`、`/api/private-media/pexels/videos/search` 和 `/api/private-media/download/[token]`。
- 已在后续 migration / repository / download token 切片补 `merchant_media_assets` / `merchant_media_clips` migration、local repository contract、60 天 token 和 302 signer 合同。
- 还未做 OpenStoryline 真实检索 smoke。

## 回滚点

若该切片引入异常，可回退：

- `app/src/lib/private-media-pexels-adapter.ts`
- `app/src/lib/private-media-pexels-adapter.test.ts`
