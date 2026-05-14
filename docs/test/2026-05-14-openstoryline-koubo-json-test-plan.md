# OpenStoryline 口播视频 JSON 测试方案

日期：2026-05-14

## 目标

本测试用于验证：用户只给一个主题时，Codex 能否生成可用的口播脚本、拍摄指导和 OpenStoryline 输入结构，并让已部署的 OpenStoryline 基于这些输入剪出满意的视频。

本轮不重新实现剪辑能力，不验证视频脚本制作模块本身，而是聚焦：

- Codex 从主题生成脚本和拍摄指导的质量。
- 给 OpenStoryline 的 JSON / prompt 结构是否足够稳定。
- 好脚本 + 好素材 + 不同输入结构，哪一种最容易得到满意成片。

第一轮测试主题固定为：咖啡店探店种草。

## 1. 脚本制作

用户只输入一个主题，例如：

```json
{
  "topic": "咖啡店探店种草"
}
```

Codex 负责从主题出发完成脚本制作：

1. 生成 3 条候选口播脚本。
2. 每条候选脚本都包含：
   - 标题。
   - 目标受众。
   - 口播正文。
   - 视频节奏。
   - 适合素材类型。
   - 推荐理由。
3. 用户与 Codex 交互后选定 1 条最终脚本。
4. 最终脚本锁定，后续测试不允许 OpenStoryline 自由改写核心内容。

第一轮推荐口播结构：

| 段落 | 作用 | 示例 |
| --- | --- | --- |
| 开头钩子 | 让用户愿意继续看 | 这家咖啡店，我会推荐给想安静坐一下午的人。 |
| 到店体验 | 建立真实感 | 进门第一感觉是空间很舒服，不是那种很吵的网红店。 |
| 核心亮点 | 给出推荐理由 | 咖啡味道稳定，座位也适合办公或聊天。 |
| 推荐收束 | 给行动理由 | 如果你想找一家能坐久一点的店，可以把它加入收藏。 |

Codex 同时输出拍摄指导：

| 口播段落 | 需要拍什么 | 建议 |
| --- | --- | --- |
| 开头钩子 | 门头、真人出镜、进店动作 | 6-8 秒，画面稳定 |
| 到店体验 | 店内环境、座位、光线 | 8-12 秒，慢横移或固定机位 |
| 核心亮点 | 咖啡制作、成品、细节 | 8-12 秒，近景特写 |
| 推荐收束 | 坐下喝咖啡、桌面、门头结尾 | 8-12 秒，氛围感画面 |

最小拍摄清单：

- 门头或外立面素材 1-2 条。
- 店内环境素材 1-2 条。
- 咖啡制作素材 1-2 条。
- 成品咖啡或桌面素材 1-2 条。
- 坐下体验或空间氛围素材 1-2 条。
- 可选真人出镜开头 1 条。

## 2. 输入方案

同一条最终脚本生成 3 种给 OpenStoryline 的输入结构。服务器负责把这些 JSON 翻译成 OpenStoryline prompt，不要求 OpenStoryline 直接理解所有字段。

### A. 弱结构基线

用途：测试自然语言 + 完整口播能做到什么程度。

```json
{
  "version": "A_baseline",
  "topic": "咖啡店探店种草",
  "videoType": "koubo_broll",
  "scriptLocked": true,
  "voiceoverText": "完整口播文案...",
  "requirements": {
    "durationSeconds": 30,
    "aspectRatio": "9:16",
    "bgm": "轻松、温暖、不压人声",
    "voice": "前后保持一致",
    "subtitles": "跟随口播出现",
    "editing": "素材切换自然"
  }
}
```

### B. 口播段落结构

用途：测试段落化是否能提升字幕和剪辑理解。

```json
{
  "version": "B_segmented_script",
  "topic": "咖啡店探店种草",
  "videoType": "koubo_broll",
  "scriptLocked": true,
  "segments": [
    {
      "segmentNo": 1,
      "role": "opening_hook",
      "timeRange": "00:00-00:06",
      "voiceover": "这家咖啡店，我会推荐给想安静坐一下午的人。",
      "subtitle": "适合安静坐一下午的咖啡店",
      "visualNeed": "门头、出镜开头或进店动作",
      "shootingGuide": "拍门头或进店动作 6-8 秒，画面稳定",
      "fallbackShot": "没有出镜时，用门头加店内环境慢切"
    }
  ],
  "requirements": {
    "bgm": "轻松、温暖、不压人声",
    "subtitles": "每段字幕跟随对应口播",
    "editing": "每段画面匹配对应 visualNeed"
  }
}
```

### C. 口播段落 + 素材绑定

用途：测试最强约束是否让 OpenStoryline 更听话。

```json
{
  "version": "C_segment_asset_bound",
  "topic": "咖啡店探店种草",
  "videoType": "koubo_broll",
  "scriptLocked": true,
  "segments": [
    {
      "segmentNo": 1,
      "role": "opening_hook",
      "timeRange": "00:00-00:06",
      "voiceover": "这家咖啡店，我会推荐给想安静坐一下午的人。",
      "subtitle": "适合安静坐一下午的咖啡店",
      "visualNeed": "门头、出镜开头或进店动作",
      "preferredAssets": ["opening.mp4", "storefront.mp4"],
      "fallbackAssets": ["interior_wide.mp4"],
      "shootingGuide": "拍门头或进店动作 6-8 秒，画面稳定",
      "fallbackShot": "没有出镜时，用门头加店内环境慢切",
      "editHint": "前 2 秒用门头或出镜，后面切到店内氛围"
    }
  ],
  "productionRequirements": {
    "bgm": "轻松、温暖、不压人声",
    "voice": "前后保持一致",
    "subtitles": "按口播段落均匀分布",
    "editing": "按 segmentNo 顺序剪辑，不要突兀切换"
  }
}
```

## 3. 测试方案

### 阶段 1：固定脚本和素材，测试输入结构

目的：判断 A/B/C 哪种结构最适合 OpenStoryline。

| Run | 输入结构 | 脚本 | 素材 |
| --- | --- | --- | --- |
| A1 | 弱结构基线 | 同一条 Codex 选定脚本 | 同一批素材 |
| B1 | 口播段落版 | 同一条 Codex 选定脚本 | 同一批素材 |
| C1 | 段落 + 素材绑定版 | 同一条 Codex 选定脚本 | 同一批素材 |

执行要求：

- 服务器执行。
- 剪辑使用已部署 OpenStoryline。
- 每个 Run 独立 session，避免上下文互相污染。
- 每个 Run 最多修正 1 次。
- 主指标看剪辑贴合度。

阶段 1 判断逻辑：

- 如果 B 明显优于 A，说明口播段落化是必要结构。
- 如果 C 明显优于 B，说明素材绑定应该进入正式输入规范。
- 如果 C 反而变差，说明过强结构可能干扰 OpenStoryline，需要改成更自然语言化的素材绑定。
- 如果 A/B/C 差异小，说明问题可能不在 JSON，而在素材质量、OpenStoryline 能力或 prompt 翻译方式。

### 阶段 2：固定最佳结构，测试素材路径

目的：判断素材来源对成片满意度的影响。

| Run | 输入结构 | 素材路径 |
| --- | --- | --- |
| Winner-Offline | 阶段 1 胜出结构 | 按 Codex 拍摄指导线下拍摄 |
| Winner-Search | 阶段 1 胜出结构 | OpenStoryline 自找或匹配素材 |

判断逻辑：

- Offline 明显更好：说明拍摄指导和真实素材关键。
- Search 可接受：说明 OpenStoryline 自找素材具备 MVP 价值。
- 两者都差：优先回看脚本结构或 prompt 翻译方式。

## 4. 输出评分

每次 Run 输出一个结果包：

```json
{
  "testRunId": "coffee_C1",
  "topic": "咖啡店探店种草",
  "scriptVersion": "codex_script_v1",
  "jsonVersion": "C_segment_asset_bound",
  "materialVersion": "offline_v1",
  "openStorylineSessionId": "xxx",
  "inputJsonPath": "path/to/input.json",
  "promptPath": "path/to/openstoryline_prompt.txt",
  "finalVideoPath": "path/to/final.mp4",
  "subtitlePath": "path/to/subtitles.srt",
  "metadataPath": "path/to/metadata.json",
  "score": {
    "bgm": 4,
    "voice": 4,
    "editing": 3,
    "subtitles": 5,
    "segmentOrder": 4,
    "assetMatch": 3
  },
  "mainProblems": [
    "第 2 段素材和口播不够贴",
    "第 3 段切换略突兀"
  ],
  "nextFix": {
    "type": "material_or_json",
    "instruction": "第 2 段明确优先使用咖啡制作近景"
  }
}
```

评分表：

| 指标 | 通过标准 |
| --- | --- |
| BGM | 有背景音乐，音量不压口播 |
| 人声 | 前后声音一致 |
| 剪辑 | 画面切换自然，不突兀 |
| 字幕 | 字幕跟随口播，不集中在前几秒 |
| 段落顺序 | 是否按 segment 1-4 表达 |
| 素材贴合 | 每段画面是否匹配口播 |

评分规则：

- 每项 1-5 分。
- 4 分及以上算可接受。
- BGM、人声、剪辑、字幕四项必须全部达到 4 分，才算 MVP 通过。
- 阶段 1 用剪辑贴合度、素材贴合、字幕分布决定最佳输入结构。

阶段汇总表：

| Run | JSON | 素材 | BGM | 人声 | 剪辑 | 字幕 | 段落顺序 | 素材贴合 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | A | 固定素材 |  |  |  |  |  |  |  |
| B1 | B | 固定素材 |  |  |  |  |  |  |  |
| C1 | C | 固定素材 |  |  |  |  |  |  |  |

## 5. 下轮迭代

每个 Run 最多修正 1 次，修正只动一个主变量：

| 问题 | 下轮动作 |
| --- | --- |
| 脚本不自然 | Codex 重写口播，但保持同一结构 |
| 素材不贴 | 补拍或重选素材 |
| 剪辑突兀 | 调整 editHint 或素材顺序 |
| 字幕集中 | 强化每段字幕时间要求 |
| BGM 或人声问题 | 调整 productionRequirements |
| C 版效果差 | 把素材绑定改成更自然语言描述 |
| A/B/C 差异小 | 说明问题不在 JSON，转查素材质量或 OpenStoryline 能力 |

最终沉淀三份结论：

1. 推荐脚本模板。
2. 推荐拍摄指导模板。
3. 推荐 OpenStoryline 输入结构。

## 参考依据

- FireRed-OpenStoryline：借鉴 session、多轮修正、自然语言导演。
- CSDN/专业论坛 OpenStoryline 文章：借鉴上传素材 + 对话式视频创作的测试思路。
- Gitee 短视频工厂类项目：借鉴脚本、TTS、字幕、剪辑、产物归档的流水线。
- mcp-video / OpenMontage 类项目：借鉴结构化状态、结果包、质量检查和复盘记录。

参考原则：只借鉴工作流颗粒度，不照搬外部接口。

## 约束与假设

- 用户只提供主题。
- Codex 负责脚本、拍摄指导和输入结构生成。
- OpenStoryline 负责剪辑。
- 第一轮主题固定为咖啡店。
- 第一阶段优先用固定线下素材测试 JSON。
- 第二阶段再比较线下素材和 OpenStoryline 自找素材。
- 当前测试重点是找到最适合 OpenStoryline 的输入结构，不是开发新的剪辑引擎。
