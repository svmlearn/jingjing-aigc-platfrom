# 2026-05-15 商家原始素材整段切片合同

## 目标

按 `ADR-MEDIA-SLICE-001` 把 V1 素材处理合同收口为确定性整段 clip：商家端原始 MP4 上传生成 1 条 `full_video` clip，图片生成 1 条 `image` clip，不做自动分镜、不做固定窗口、不让 LLM / VLM 决定切点。

## 已完成

- 新增纯合同模块：
  - `app/src/lib/media-processing-contract.ts`
- 扩展 clip 合同字段：
  - `clipIndex`
  - `clipType`
  - `startTimeSeconds`
  - `endTimeSeconds`
- V1 合同覆盖：
  - MP4 原始商家上传只从 `uploaded` / `validating` 开始。
  - 视频 ready 后只生成 1 条 `clipIndex = 0`、`clipType = full_video` 的整段 clip。
  - 图片 ready 后只生成 1 条 `clipIndex = 0`、`clipType = image` 的 image clip。
  - V1 不重编码、不裁剪视频，ready clip 的 `cosKey` 引用原始 `sourceCosKey`。
  - 视频 `startTimeSeconds = 0`，`endTimeSeconds = durationSeconds`。
  - 宽高、时长、方向必须来自解析后的 metadata fixture，不能由标签模型猜。
  - 缩略图 `thumbCosKey` 必须存在并位于商家 thumbs 前缀。
  - 标签可以使用 fixture / mock，但 `tagSource` 必须显式写清。
  - 低置信度或标签不足进入 `needs_retag`。
  - 超过 V1 自动 ready 时长上限进入 `needs_reclip`，不得静默截断。
  - 成员端临时上传不能进入商家素材处理。

## 验证

已执行：

```powershell
cd app
node --test src/lib/media-processing-contract.test.ts src/lib/merchant-media-library-contract.test.ts src/lib/media-upload-contract.test.ts src/lib/private-media-pexels-adapter.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `20` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- 媒体解析：使用 fixture metadata，未调用真实 ffprobe。
- 缩略图：使用 fixture `thumbCosKey`，未生成真实图片。
- 标签：使用 fixture 标签，`tagSource = fixture`，不是已完成真实 VLM / LLM 识别。
- COS：未调用真实 COS。
- 本地测试素材：本切片未读取 `D:\Desktop\测试素材`，未复制二进制进 git。
- 重要素材语义：`D:\Desktop\测试素材` 下 MP4 只能作为 raw merchant upload 输入；M4A 只能作为 raw user voice recording / ref audio 输入，不能进入 `merchant_media_*`。

## 后续

- 接入真实处理 worker 时，应把 ffprobe / 文件签名 / 缩略图生成结果映射到本合同。
- 后续如需使用 `D:\Desktop\测试素材`，只能作为 raw input 触发本合同，不得直接当 ready clip。
- V2 多段切片必须另起 ADR 复审，不能在 V1 中让 LLM / VLM 决定切点。
