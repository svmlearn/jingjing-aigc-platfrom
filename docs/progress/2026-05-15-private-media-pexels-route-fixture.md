# 2026-05-15 私有 Pexels-compatible app route fixture 合同

## 目标

在不把 Supabase 作为硬依赖的前提下，补齐 app 侧私有 Pexels-compatible 搜索入口和 60 天下载 token 入口的本地合同。

## 已完成

- 新增 app route：
  - `GET /api/private-media/pexels/videos/search`
  - `GET /api/private-media/pexels/v1/search`
  - `GET /api/private-media/download/[token]`
- 新增 repository interface：
  - `PrivateMediaClipRepository`
  - 当前实现为 `InMemoryPrivateMediaClipRepository`
- 新增本地 fixture clips，覆盖：
  - 当前商家 ready video / photo
  - 其他商家素材
  - `tagging_failed` 素材
- 新增 60 天 download token：
  - HMAC 签名
  - token payload 只包含 `clipId / kind / expiresAt`
  - token 篡改拒绝
- 搜索响应继续复用纯 adapter：
  - repository 显式按 `merchantId` list
  - response 不暴露 `merchantId`、COS key、bucket、内部 tags
  - `link/src` 返回 `/api/private-media/download/[token]`

## 验证

本轮为本地 fixture / contract 验证，未依赖 Supabase、真实 COS 或真实私有素材库 DB。

已执行：

```powershell
cd app
node --test src/lib/private-media-pexels-adapter.test.ts src/server/api/private-media-pexels-service.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `8` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出 `MODULE_TYPELESS_PACKAGE_JSON` warning，和现有 TS node test 行为一致，不影响合同验证

## Mock / Real 记录

- 私有素材 repository：mock / in-memory fixture。
- 下载 token：真实本地 HMAC token 逻辑。
- 下载 route：本地合同已走服务端 302 signer；fixture signer 生成可断言的 COS read URL，未调用真实 COS。
- Supabase：未使用，符合“Supabase may be replaced，不作为本轮硬依赖”的更新规则。
- 本地二进制测试素材：本切片未需要读取 `D:\Desktop\测试素材`，未复制任何二进制进 git。
- Fixture-level workflow substitute：
  - 新增 `app/src/lib/private-media-workflow-fixture.test.ts`。
  - 串起 Dify final_result_json fixture -> `note` + `video_script` variants -> shared `video_edit_jobs.input_payload` builder -> private Pexels-compatible search -> 60 天 download token -> download 302 signer -> private-media doctor clean gate。
  - 该测试明确作为缺真实 Dify / Supabase / COS / RunningHub key 时的本地替代 smoke，不把真实 OpenStoryline 出片写成已完成。

## 后续

- 将 repository interface 接到真实 `merchant_media_assets / merchant_media_clips` 或通用 Postgres repository。
- 下载 route 接入真实 COS 重签 / 代理下载 smoke，并保留下架、quarantine、missing_object 拦截。
- 使用本地 MP4 fixture 做媒体元数据解析、切片 / 标签 contract 时，只引用 `D:\Desktop\测试素材`，不提交二进制。
