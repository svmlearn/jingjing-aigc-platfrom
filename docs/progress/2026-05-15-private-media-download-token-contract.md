# 2026-05-15 私有素材 60 天下载入口合同

## 目标

把 Pexels-compatible 返回的 60 天平台下载 token 和素材状态拦截拆成可测试合同：token 未过期不代表素材一定可下载，`archived` / `quarantined` / `missing_object` / 非 ready 都必须被服务端入口拒绝。

## 已完成

- 新增纯服务模块：
  - `app/src/lib/private-media-download-service-core.ts`
- 新增合同测试：
  - `app/src/lib/private-media-download-service-core.test.ts`
- 更新 route：
  - `app/src/app/api/private-media/download/[token]/route.ts`
- 行为：
  - 有效 token + ready clip：返回 `302`，由服务端 signer 生成临时读 URL。
  - 过期 token：返回 `PRIVATE_MEDIA_DOWNLOAD_EXPIRED`。
  - 篡改 token：返回 `PRIVATE_MEDIA_DOWNLOAD_TOKEN_INVALID`。
  - `tagging_failed` / 非 ready：返回 `PRIVATE_MEDIA_DOWNLOAD_REVOKED`。
  - `archived`：返回 `PRIVATE_MEDIA_DOWNLOAD_ARCHIVED`。
  - `quarantined`：返回 `PRIVATE_MEDIA_DOWNLOAD_QUARANTINED`。
  - `missing_object`：返回 `PRIVATE_MEDIA_DOWNLOAD_MISSING_OBJECT`。
  - thumb 下载使用 `thumbCosKey` 和 `image/jpeg`。

## 验证

已执行：

```powershell
cd app
node --test src/lib/private-media-download-service-core.test.ts src/server/api/private-media-pexels-service.test.ts src/lib/private-media-pexels-adapter.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `12` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- 60 天 token：真实 HMAC 本地合同。
- COS 重签：测试中使用注入 signer fixture；未调用真实 COS。
- Next route：已接真实 `createCosSignedReadUrl` 接口，但本机缺 COS key 时不作为本轮 blocker。
- Pexels response：仍只暴露平台 download token URL，不暴露 COS key / bucket / 内部 tags。

## 后续

- 接真实 repository 时，`getClipById` 必须同样验证租户上下文或只允许通过不可猜 token + 状态查询访问。
- 真实 COS smoke 需要 COS 参数 SET 后验证 302 目标可访问；本轮缺本机 COS key 不阻塞合同验证。
