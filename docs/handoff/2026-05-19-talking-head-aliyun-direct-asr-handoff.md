# 2026-05-19 真人口播默认原声 + 阿里云整段直 ASR 字幕方案交接

## 1. 文档目的

本交接文档用于把“真人口播片段默认使用原视频人声，并用阿里云 ASR 生成字幕轨”的产品和技术方案交给后续线程继续讨论或实现。

注意：本文是方案交接，不代表代码已完成实现。

相关但不同的已有文档：

- `docs/handoff/2026-05-19-aliyun-cloud-asr-migration-handoff.md`

那份文档记录的是底层 ASR provider 从本地 FunASR 迁到阿里云 DashScope Paraformer 的代码迁移。本文件记录的是更上层的产品链路方案：真人口播如何默认使用原声、如何做整段直 ASR、如何生成字幕轨。

## 2. 当前已确认决策

### 2.1 产品决策

- 只要素材或场景被判定为真人口播片段，默认使用原视频人声。
- 这不是用户手动选择“是否保留真人原声”，而是口播分支的默认规则。
- ASR 只用于真人口播字幕，不用于普通 TTS / 脚本字幕视频。
- 字幕采用独立字幕轨注入，不预烧到原视频画面里。
- ASR 失败、缺 key、识别为空或时间戳无法映射时，任务进入可重试失败。
- 不回退脚本字幕。
- 不静默无字幕出片。
- 不自动切到本地 FunASR。

### 2.2 部署决策

- 生产环境只使用阿里云 ASR：`aliyun_paraformer`。
- 不部署本地 FunASR 模型。
- 不把 ASR 模型上传或部署到 OSS。
- `DASHSCOPE_API_KEY` 可以作为 key fallback，但 provider 必须是阿里云 ASR。

### 2.3 音频决策

- 原视频人声音量保持 `video_volume_scale = 1.0`。
- BGM 默认保持 `bgm_volume_scale = 0.25`。
- 暂不加口播声音检测。
- 暂不做动态 ducking。
- 暂不自动把 BGM 降得更低。
- ASR 识别输入必须是原始口播音频，不包含后续 BGM。

## 3. 不做事项

本轮明确不选择：

- Clip ASR 作为主方案。
- 生产部署本地 FunASR。
- OSS 部署 ASR 模型。
- 预烧字幕。
- 口播声音检测。
- 自动人声增强。
- 动态 BGM ducking。
- ASR 失败后自动回退脚本字幕。

## 4. Clip ASR 与整段直 ASR 对比

### 4.1 Clip ASR

现有接近路径：

```text
split_shots
-> local_asr/asr
-> group_clips
-> generate_script
-> plan_timeline
-> render_video
```

优点：

- 更贴近当前 OpenStoryline / FireRed 编排。
- 改动较小。
- 已有 `local_asr -> asr_infos -> group_scripts` 的一部分基础。

问题：

- 稳定性依赖切片、分组、口播标签、ASR、字幕映射多个环节。
- 句子可能被切片切断，字幕体验变碎。
- 切片结果和最终使用片段不一致时，字幕可能错位。
- 不符合当前“稳定链路优先”的目标。

### 4.2 整段直 ASR

目标路径：

```text
原始真人口播视频
-> 整段 ASR
-> 得到句子级 text/start/end
-> 根据最终 source_window 映射到 timeline_window
-> render_video 渲染字幕轨
```

优点：

- 更稳定，不依赖切片和分组来完成 ASR。
- 句子完整，字幕更自然。
- 同一口播素材的 ASR 结果后续可缓存复用。
- 更符合“口播片段默认真人原声”的产品逻辑。

问题：

- 如果原视频很长但最终只用几秒，会多花一些 ASR 成本。
- 需要新增“源视频时间戳 -> 成片时间线”的映射逻辑。

结论：

- 先采用整段直 ASR。
- 后续如成本或耗时明显偏高，再优化为“只识别最终使用窗口”。

## 5. 口播判定规则

口播判定优先依赖结构化标记，不依赖文件名。

可用字段：

```text
role
sceneType
tags
labels
metadata
```

可识别值建议包括：

```text
talking_head
user_talking_head
talking-head
talkinghead
真人口播
口播
出镜讲解
人物讲解
真人开头口播
真人结尾口播
```

只要片段或素材被判定为真人口播，执行侧应视为：

```text
audio_source = original_video_audio
subtitle_source = asr_original_audio
preserve_clip_duration = true
skip_voiceover = true
```

## 6. App / Payload 目标合同

App/API 需要支持：

```ts
productionConfig.subtitles.talkingHeadSource?: "script" | "asr_original_audio";
```

真人口播任务默认写入：

```json
{
  "productionConfig": {
    "subtitles": {
      "enabled": true,
      "style": "platform_default",
      "talkingHeadSource": "asr_original_audio"
    },
    "render": {
      "preserveTalkingHeadOriginalAudio": true,
      "includeOriginalAudio": true
    },
    "bgm": {
      "enabled": true,
      "volume": 0.25
    }
  }
}
```

注意：

- 不要要求用户手动选择“保留真人原声”。
- 不要因为口播分支自动把 BGM 降得很低。
- 普通非口播任务仍使用脚本字幕。
- 非口播 TTS 场景不触发 ASR。

## 7. ASR Provider 门禁

生产环境强制：

```env
OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer
ALIYUN_ASR_MODEL=paraformer-realtime-v2
ALIYUN_ASR_API_KEY=<DashScope/Bailian API Key>
```

允许：

```env
DASHSCOPE_API_KEY=<DashScope/Bailian API Key>
```

作为 key fallback。

禁止生产链路 fallback 到：

```text
local_funasr
funasr
local
```

门禁规则：

- `asr_original_audio` 分支必须使用 `aliyun_paraformer`。
- 缺少 `ALIYUN_ASR_API_KEY` 且缺少 `DASHSCOPE_API_KEY` 时，任务失败。
- provider 不是阿里云 ASR 时，任务失败。
- 不触发本地 FunASR 模型加载。

## 8. 字幕时间线映射

整段 ASR 输出建议标准化为：

```json
{
  "assetId": "asset-1",
  "provider": "aliyun_paraformer",
  "sentences": [
    {
      "text": "这套房最大的亮点是层高很舒服",
      "start": 10200,
      "end": 12600
    }
  ]
}
```

时间戳含义：

- ASR 的 `start/end` 是原始口播素材时间，单位毫秒。
- `plan_timeline.tracks.video[]` 中已有：
  - `source_window.start/end`
  - `timeline_window.start/end`
  - `playback_rate`

映射规则：

- 如果一句 ASR 的时间范围落入某个 `source_window`，则映射到对应 `timeline_window`。
- 如果一句跨多个窗口，优先拆成多个字幕段。
- 如果暂不做拆句，也可以按重叠最长的窗口归属，但必须记录技术债。
- 映射后的字幕继续进入标准 `tracks.subtitles[]`，由 `render_video` 统一渲染。

建议映射公式：

```text
timeline_start = video.timeline_window.start
  + (sentence.start - video.source_window.start) / playback_rate

timeline_end = video.timeline_window.start
  + (sentence.end - video.source_window.start) / playback_rate
```

需要 clamp 到对应 `timeline_window` 内。

## 9. 失败策略

以下情况进入可重试失败：

- 阿里云 ASR 调用失败。
- ASR API key 缺失。
- ASR provider 不是 `aliyun_paraformer`。
- 口播素材没有可识别音频。
- ASR 返回空文本。
- ASR 时间戳无法映射到最终视频时间线。

不允许：

- 自动回退脚本字幕。
- 自动无字幕出片。
- 自动切到本地 FunASR。
- 静默跳过 ASR 失败。

## 10. 建议改动位置

重点关注：

- `app/src/contracts/video.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/api/video-job-payload.ts`
- `workers/video-worker/worker/app/directive.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline.py`

## 11. 测试要求

### App/API

- 真人口播任务默认生成 `asr_original_audio`。
- 普通非口播任务仍使用脚本字幕。
- BGM 默认仍是 `0.25`。
- 不需要用户手动选择“保留真人原声”。

### Worker / Directive

- `asr_original_audio` 被正确规范化。
- `preserveTalkingHeadOriginalAudio` 时：
  - `include_video_audio = true`
  - `video_volume_scale = 1`
- 非口播 TTS 场景不触发 ASR。

### FireRed / OpenStoryline

- 生产 provider 不是 `aliyun_paraformer` 时失败。
- 缺少阿里云 key 时失败。
- 整段 ASR 输出可映射到最终字幕轨。
- ASR 空文本进入可重试失败。
- 不触发本地 FunASR 模型加载。

### Render

- 原视频人声保留。
- BGM 音量保持 `0.25`。
- 字幕轨正常叠加。
- 字幕文件正常产出。

## 12. 最终结论

本方案选择：

```text
真人口播默认真人原声
+ 阿里云整段直 ASR
+ 字幕轨注入
+ BGM 默认 0.25
+ 原视频人声 1.0
+ ASR 失败可重试失败
```

本方案不选择：

```text
clip ASR
本地 FunASR 生产部署
OSS 部署 ASR 模型
预烧字幕
口播声音检测
动态 ducking
```

## 13. 当前状态

- 文档状态：方案交接，待后续线程实现。
- 代码实现：本文不声明已完成。
- push / merge：未执行。
