# OpenStoryline 每版上传 JSON 结构稿

日期：2026-05-14

## 文档用途

这份文档先只回答一个问题：**每一版传给 OpenStoryline / 服务器出片链路的 JSON 应该长什么样**。

后续对比评分文档会基于这里的 A/B/C/D/E 五版继续评估：

- JSON 结构是否稳定。
- OpenStoryline 是否容易理解。
- 素材绑定是否足够可控。
- 口播、字幕、声音克隆和最终成片是否可追踪。

本文件不做最终评分，只沉淀“上传 JSON 候选稿”。

## A/B/C/D/E 为什么看起来重复

这五个版本会共享同一份脚本、同一批素材和同一个目标，这是故意的。  
如果每版脚本和素材都不一样，就没法判断“到底是 JSON 结构更好，还是脚本/素材变了导致结果不同”。

所以本轮只改变一个主变量：**传给 OpenStoryline/worker 的结构约束强度**。

| 版本 | 核心问题 | JSON 差异 | 适合验证什么 |
| --- | --- | --- | --- |
| A 弱结构 + 克隆声音 | 只给完整口播和自然语言要求够不够？ | 没有分镜数组；主要靠 `script_text` + `instruction_text`；使用克隆声音 | OpenStoryline 自由理解能力下限 + 克隆声音基础链路 |
| B 分段结构 + 普通配音 | 把口播拆成段落会不会更稳？ | 增加 `segments`，每段有时间、口播、字幕、画面需求；使用普通 TTS 配音 | 字幕节奏、段落顺序、基础剪辑贴合 |
| C 分段 + 文件名绑定 + 普通配音 | 明确每段优先用哪个素材会不会更听话？ | 在 B 基础上增加 `preferredAssets/fallbackAssets/editHint`；使用普通 TTS 配音 | 素材贴合度、画面选择稳定性 |
| D 已跑通实测版 | 当前服务器真实跑通的结构长什么样？ | 使用 `production_directive.scenes`，素材仍以自然语言 `materials` 描述；带 `pixelle_clone` 配置 | 真实链路可用性、当前问题定位 |
| E 推荐正式版 + 克隆声音 | 后续产品/工程合同应该长什么样？ | 在 D 基础上增加稳定 `asset_id` 绑定、`voice_profile_id/ref_audio_asset_id`、`voiceover_artifacts` 要求；使用克隆声音 | 正式接口、前端音色库、回传与评分闭环 |

一句话区分：

- **A** 看“只讲清楚要什么，OpenStoryline 自己发挥行不行”。
- **B** 看“普通配音下，把脚本拆段后，顺序和字幕能不能稳”。
- **C** 看“普通配音下，把每段素材说清楚后，画面能不能贴”。
- **D** 是“我们已经用服务器跑通的一版真实样本”。
- **E** 是“把 D 的经验整理成未来正式合同，并保留克隆声音闭环”。

### D 版到底是什么

D 版不是另一个理论方案，它是上一轮服务器真实出片时实际使用的 JSON。它的价值是：证明这条链路已经能从用户素材、D 版脚本、声音样本跑到 `final.mp4`。

D 版和 C 版的区别：

- C 版是测试方案里人为设计的“段落 + 文件名绑定”结构，重点是验证素材绑定是否有用。
- D 版是服务器实际跑通的结构，重点是记录真实链路已经接受了哪些字段。
- C 版里素材绑定是 `preferredAssets/fallbackAssets`。
- D 版里素材绑定是每个 scene 的 `materials` 自然语言描述，例如“素材 01：xxx.mp4，外立面招牌和入口”。
- C 版更像测试输入；D 版更像生产链路当前真实输入。

D 版和 E 版的区别：

- D 版能跑通，但还不够“工程可验收”。
- D 版没有稳定 `asset_id` 绑定，后续自动校验时很难判断某段到底用了哪个素材。
- D 版虽然传了 `pixelle_clone/ref_audio`，但 response 里 `openstoryline.voiceover` 为空，voiceover artifact 没有稳定回传。
- E 版就是把 D 版跑通后暴露的问题补齐：加 `scene_asset_bindings`、`voice_profile_id`、`ref_audio_asset_id`、`voiceover_artifacts`。

所以 D 版在对比里的角色是：**真实基线**。  
它不是最弱，也不是最终版，而是“现在已经能跑的版本”，后面评分和改造都应该以它为参照。

## 固定测试素材

为了让 A/B/C/D/E 可横向比较，建议都使用同一批素材和同一条锁定脚本。

**D 版脚本真相源**：

```text
D:\codexplan\personal\jingjing-content-platform\docs\探索\2026-05-14-soundsix-space-video-script.md
```

这份脚本是上一轮 D 版服务器实测成片使用的脚本，不是本文件重新生成的新脚本。  
本文件中的 D/E JSON 只负责把这份脚本翻译成可上传的 OpenStoryline/worker 结构。

本地素材目录：

```text
D:\Desktop\测试素材
```

该目录当前包含：

```text
20260513_164427.m4a
344452508fd33cdc7f19cd869714b0cc.mp4
8afac4f50ce7a3d2c8ed6888d77645b2.mp4
c4e75271ee4578766ba688f32fdb8af1.mp4
dfc0bf31bc19aed4435d6aafb342ad5d.mp4
```

声音策略：

- A：使用克隆声音。
- B：使用普通 TTS 配音。
- C：使用普通 TTS 配音。
- D：保持真实跑通基线，使用克隆声音。
- E：使用克隆声音。

服务器输入包参考：

```text
/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone
```

素材列表：

```json
[
  {
    "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
    "asset_type": "video",
    "file_name": "01-storefront.mp4",
    "description": "素材 01 外立面、招牌、通道、发光入口"
  },
  {
    "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
    "asset_type": "video",
    "file_name": "02-entrance.mp4",
    "description": "素材 02 入口台阶、草坪、门头、庭院过渡"
  },
  {
    "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
    "asset_type": "video",
    "file_name": "03-yard.mp4",
    "description": "素材 03 户外草坪、白色桌椅、遮阳伞、墙绘树影"
  },
  {
    "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
    "asset_type": "video",
    "file_name": "04-drink.mp4",
    "description": "素材 04 室内桌面、杯子、近景氛围"
  }
]
```

声音克隆参考音频：

```json
{
  "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a",
  "asset_type": "audio",
  "file_name": "voice-ref-20260513_164427.m4a",
  "description": "用户声音样本"
}
```

## 线上素材口径

当前线上素材搜索/补充路径暂时按 **Pexels** 处理，不写成泛泛的“OpenStoryline 自找素材”。

因此后续如果扩展线上素材版本，建议单独标记为 `material_policy: "pexels_search"` 或 `material_source: "pexels"`，并把搜索词、返回素材 URL、下载后的本地路径、授权/来源信息写进 `runtime_payload.pexels_search`。

示例：

```json
{
  "material_policy": "pexels_search",
  "runtime_payload": {
    "pexels_search": {
      "enabled": true,
      "query": "quiet courtyard coffee shop vertical video",
      "source": "pexels",
      "asset_license": "pexels",
      "downloaded_assets": [
        {
          "source_url": "https://www.pexels.com/video/example",
          "local_path": "/srv/jingjing-video-worker/tmp/example/pexels/coffee-courtyard-01.mp4",
          "asset_type": "video",
          "file_name": "coffee-courtyard-01.mp4"
        }
      ]
    }
  }
}
```

本轮 A/B/C/D/E 仍优先用用户提供的固定素材做结构对比；Pexels 版本用于后续“线上素材路径”单独对比。

来自 D 版脚本的锁定口播：

```text
路过这里，别急着走。
不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。
进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。
你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。
点一杯喝的，手机放旁边，节奏就会自然慢下来。
如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。
```

## 外层统一上传合同

实际传给服务器 `/v1/runs` 时，外层建议统一使用当前 worker/OpenStoryline 合同：

```json
{
  "job_id": "string",
  "merchant_id": "string",
  "draft_id": "string",
  "content_variant_id": "string",
  "instruction_text": "string",
  "workspace_dir": "string",
  "output_dir": "string",
  "input_assets": [],
  "execution_mode": "staging_worker",
  "script_text": "string",
  "production_directive": {},
  "production_config": {},
  "runtime_payload": {}
}
```

A/B/C 的差异主要放在 `runtime_payload.input_structure` 和 `instruction_text`。  
D 是已跑通过的实测结构。  
E 是推荐正式结构，会把差异字段提升为稳定合同字段。

---

## A 版：弱结构基线上传 JSON

用途：测试“完整口播 + 自然语言要求”能做到什么程度。

特点：

- 结构最轻。
- 不显式分段。
- 不显式绑定素材。
- 对 OpenStoryline 依赖最大。

```json
{
  "job_id": "soundsix_json_A_baseline_20260514",
  "merchant_id": "soundsix",
  "draft_id": "soundsix-space-20260514",
  "content_variant_id": "json-A-baseline",
  "instruction_text": "请只使用我提供的 4 条实拍素材，制作一条约 45 秒的竖版口播探店视频。脚本已经锁定，不要改写核心口播。字幕跟随口播出现。最终必须输出 final.mp4。",
  "workspace_dir": "/srv/jingjing-video-worker/tmp/soundsix-20260514-json-A/workspace",
  "output_dir": "/srv/jingjing-video-worker/outputs/soundsix_json_A_baseline_20260514",
  "execution_mode": "server_openstoryline_json_structure_test",
  "input_assets": [
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
      "asset_type": "video",
      "file_name": "01-storefront.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
      "asset_type": "video",
      "file_name": "02-entrance.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
      "asset_type": "video",
      "file_name": "03-yard.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
      "asset_type": "video",
      "file_name": "04-drink.mp4"
    }
  ],
  "script_text": "SOUNDSIX 小院空间探店视频脚本\n脚本来源：D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md\n标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n目标时长：约 45 秒\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\n完整口播稿：路过这里，别急着走。不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。点一杯喝的，手机放旁边，节奏就会自然慢下来。如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
  "production_directive": {
    "script_locked": true,
    "desired_outputs": ["final_video", "subtitles", "metadata"],
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "material_policy": "use_only_input_assets"
  },
  "production_config": {
    "voiceover": {
      "enabled": true,
      "mode": "cloned",
      "provider": "pixelle_clone",
      "clone_enabled": true,
      "ref_audio": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a",
      "language": "zh"
    },
    "subtitles": {
      "enabled": true,
      "style": "douyin_clean_bottom",
      "source": "voiceover_text"
    },
    "bgm": {
      "enabled": false
    },
    "render": {
      "format": "mp4",
      "resolution": "1080x1920",
      "fps": 30
    }
  },
  "runtime_payload": {
    "input_structure": {
      "version": "A_baseline",
      "topic": "SOUNDSIX 小院空间探店视频脚本",
      "videoType": "koubo_broll",
      "scriptLocked": true,
      "scriptSource": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
      "voiceoverText": "路过这里，别急着走。不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。点一杯喝的，手机放旁边，节奏就会自然慢下来。如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
      "requirements": {
        "durationSeconds": 45,
        "aspectRatio": "9:16",
        "subtitles": "跟随口播出现",
        "editing": "素材切换自然"
      }
    }
  }
}
```

---

## B 版：口播段落结构上传 JSON

用途：测试段落化是否能提升字幕和剪辑理解。

特点：

- 有 `segments`。
- 每段包含口播、字幕、画面需求。
- 仍不绑定具体素材文件。
- 使用普通 TTS 配音，不使用克隆声音。

```json
{
  "job_id": "soundsix_json_B_segmented_20260514",
  "merchant_id": "soundsix",
  "draft_id": "soundsix-space-20260514",
  "content_variant_id": "json-B-segmented",
  "instruction_text": "请按 segments 顺序剪辑。每段字幕跟随对应口播。只使用 input_assets 中的 4 条素材，不要搜索外部素材。最终必须输出 final.mp4。",
  "workspace_dir": "/srv/jingjing-video-worker/tmp/soundsix-20260514-json-B/workspace",
  "output_dir": "/srv/jingjing-video-worker/outputs/soundsix_json_B_segmented_20260514",
  "execution_mode": "server_openstoryline_json_structure_test",
  "input_assets": [
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
      "asset_type": "video",
      "file_name": "01-storefront.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
      "asset_type": "video",
      "file_name": "02-entrance.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
      "asset_type": "video",
      "file_name": "03-yard.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
      "asset_type": "video",
      "file_name": "04-drink.mp4"
    }
  ],
  "script_text": "SOUNDSIX 小院空间探店视频脚本\n脚本来源：D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md\n标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n目标时长：约 45 秒\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\nScene 1：路过这里，别急着走。\nScene 2：不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。\nScene 3：进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。\nScene 4：你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。\nScene 5：点一杯喝的，手机放旁边，节奏就会自然慢下来。\nScene 6：如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
  "production_directive": {
    "script_locked": true,
    "desired_outputs": ["final_video", "subtitles", "metadata"],
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "segments": [
      {
        "segmentNo": 1,
        "role": "opening_hook",
        "timeRange": "00:00-00:04",
        "voiceover": "路过这里，别急着走。",
        "subtitle": "楼群里，藏着一个可以坐下来的小院",
        "visualNeed": "外立面、招牌、街区通道或门口入口",
        "shootingGuide": "开场节奏稍快，先建立隐藏在楼群里的空间感",
        "fallbackShot": "如果招牌不清楚，就用通道和门口发光入口做开场"
      },
      {
        "segmentNo": 2,
        "role": "arrival_path",
        "timeRange": "00:04-00:10",
        "voiceover": "不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。",
        "subtitle": "走进去，才发现里面很安静",
        "visualNeed": "入口台阶、草坪、门头、走进去的动线",
        "shootingGuide": "手持向前走，轻微上摇",
        "fallbackShot": "若入口素材不够稳，用门口画面补足"
      },
      {
        "segmentNo": 3,
        "role": "space_value",
        "timeRange": "00:10-00:18",
        "voiceover": "进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。",
        "subtitle": "小草坪 + 户外座位，适合慢慢坐一会儿",
        "visualNeed": "户外草坪、白色桌椅、玻璃桌",
        "shootingGuide": "慢速横移，保持画面平稳",
        "fallbackShot": "桌椅画面晃动时，截取稳定片段"
      },
      {
        "segmentNo": 4,
        "role": "atmosphere_detail",
        "timeRange": "00:18-00:26",
        "voiceover": "你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。",
        "subtitle": "不吵、不挤，适合短暂放空",
        "visualNeed": "墙绘树影、遮阳伞、空座位、桌面反光",
        "shootingGuide": "节奏放慢，给环境留停顿",
        "fallbackShot": "墙绘不清楚时，用桌椅和草坪远景表达安静感"
      },
      {
        "segmentNo": 5,
        "role": "drink_closeup",
        "timeRange": "00:26-00:34",
        "voiceover": "点一杯喝的，手机放旁边，节奏就会自然慢下来。",
        "subtitle": "点一杯，坐下来，节奏慢一点",
        "visualNeed": "室内桌面、杯子、手部或桌边细节",
        "shootingGuide": "近景固定或轻微下压",
        "fallbackShot": "杯子画面太短时，用玻璃桌面近景延长"
      },
      {
        "segmentNo": 6,
        "role": "cta",
        "timeRange": "00:34-00:45",
        "voiceover": "如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
        "subtitle": "先收藏｜私信问定位和营业时间",
        "visualNeed": "门口入口、外立面招牌或庭院全景",
        "shootingGuide": "最后一秒画面停稳，方便挂 CTA 字幕",
        "fallbackShot": "入口人物较多时，用空庭院全景做 CTA 背景"
      }
    ],
    "material_policy": "use_only_input_assets"
  },
  "production_config": {
    "voiceover": {
      "enabled": true,
      "mode": "default",
      "provider": "bytedance_bigtts",
      "language": "zh",
      "volume": 2
    },
    "subtitles": {
      "enabled": true,
      "style": "douyin_clean_bottom",
      "source": "segments"
    },
    "bgm": {
      "enabled": false
    },
    "render": {
      "format": "mp4",
      "resolution": "1080x1920",
      "fps": 30
    }
  },
  "runtime_payload": {
    "input_structure": {
      "version": "B_segmented_script",
      "script_source": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
      "segment_source": "production_directive.segments"
    }
  }
}
```

---

## C 版：口播段落 + 素材绑定上传 JSON

用途：测试“分段 + 指定素材”是否让 OpenStoryline 更听话。

特点：

- 有 `segments`。
- 每段有 `preferredAssets` 和 `fallbackAssets`。
- 但素材绑定仍主要靠文件名，缺少稳定 asset id。
- 使用普通 TTS 配音，不使用克隆声音。

```json
{
  "job_id": "soundsix_json_C_asset_bound_20260514",
  "merchant_id": "soundsix",
  "draft_id": "soundsix-space-20260514",
  "content_variant_id": "json-C-asset-bound",
  "instruction_text": "请严格按 segments 顺序剪辑，并优先使用每段 preferredAssets 指定素材。fallbackAssets 只在首选素材不足时使用。只使用 input_assets 中的素材，不要搜索外部素材。",
  "workspace_dir": "/srv/jingjing-video-worker/tmp/soundsix-20260514-json-C/workspace",
  "output_dir": "/srv/jingjing-video-worker/outputs/soundsix_json_C_asset_bound_20260514",
  "execution_mode": "server_openstoryline_json_structure_test",
  "input_assets": [
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
      "asset_type": "video",
      "file_name": "01-storefront.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
      "asset_type": "video",
      "file_name": "02-entrance.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
      "asset_type": "video",
      "file_name": "03-yard.mp4"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
      "asset_type": "video",
      "file_name": "04-drink.mp4"
    }
  ],
  "script_text": "SOUNDSIX 小院空间探店视频脚本\n日期：2026-05-14\n目标平台：抖音 / 小红书竖版短视频\n目标时长：约 45 秒\n内容方向：实景探店 / 空间种草 / 到店咨询\n\n视频定位：用 4 条现有竖版实拍素材，制作一条“藏在楼群里的安静小院”探店视频。\n\n成片标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\n\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\n\n完整口播稿：\n路过这里，别急着走。\n不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。\n进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。\n你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。\n点一杯喝的，手机放旁边，节奏就会自然慢下来。\n如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。\n\n分镜脚本：按 Scene 1 到 Scene 6 锁定，详细字段见 production_directive.scenes。\n\n脚本来源：D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
  "production_directive": {
    "script_locked": true,
    "desired_outputs": ["final_video", "subtitles", "metadata"],
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "segments": [
      {
        "segmentNo": 1,
        "role": "opening_hook",
        "timeRange": "00:00-00:04",
        "voiceover": "路过这里，别急着走。",
        "subtitle": "楼群里，藏着一个可以坐下来的小院",
        "visualNeed": "外立面、招牌、街区通道或门口入口",
        "preferredAssets": ["01-storefront.mp4"],
        "fallbackAssets": ["02-entrance.mp4"],
        "editHint": "前 1 秒节奏稍快，保留入口和招牌信息"
      },
      {
        "segmentNo": 2,
        "role": "arrival_path",
        "timeRange": "00:04-00:10",
        "voiceover": "不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。",
        "subtitle": "走进去，才发现里面很安静",
        "visualNeed": "入口台阶、草坪、门头、走进去的动线",
        "preferredAssets": ["02-entrance.mp4"],
        "fallbackAssets": ["01-storefront.mp4"],
        "editHint": "镜头从入口向内推进，表达可抵达"
      },
      {
        "segmentNo": 3,
        "role": "space_value",
        "timeRange": "00:10-00:18",
        "voiceover": "进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。",
        "subtitle": "小草坪 + 户外座位，适合慢慢坐一会儿",
        "visualNeed": "户外草坪、白色桌椅、玻璃桌",
        "preferredAssets": ["03-yard.mp4"],
        "fallbackAssets": ["02-entrance.mp4"],
        "editHint": "优先使用稳定的庭院和座位画面"
      },
      {
        "segmentNo": 4,
        "role": "atmosphere_detail",
        "timeRange": "00:18-00:26",
        "voiceover": "你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。",
        "subtitle": "不吵、不挤，适合短暂放空",
        "visualNeed": "墙绘树影、遮阳伞、空座位、桌面反光",
        "preferredAssets": ["03-yard.mp4"],
        "fallbackAssets": ["04-drink.mp4"],
        "editHint": "节奏放慢，保留 1 到 2 秒环境停顿"
      },
      {
        "segmentNo": 5,
        "role": "drink_closeup",
        "timeRange": "00:26-00:34",
        "voiceover": "点一杯喝的，手机放旁边，节奏就会自然慢下来。",
        "subtitle": "点一杯，坐下来，节奏慢一点",
        "visualNeed": "室内桌面、杯子、手部或桌边细节",
        "preferredAssets": ["04-drink.mp4"],
        "fallbackAssets": ["03-yard.mp4"],
        "editHint": "用近景承接坐下来喝一杯的动作"
      },
      {
        "segmentNo": 6,
        "role": "cta",
        "timeRange": "00:34-00:45",
        "voiceover": "如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
        "subtitle": "先收藏｜私信问定位和营业时间",
        "visualNeed": "门口入口、外立面招牌或庭院全景",
        "preferredAssets": ["01-storefront.mp4", "03-yard.mp4"],
        "fallbackAssets": ["02-entrance.mp4"],
        "editHint": "最后一秒画面停稳，方便挂 CTA 字幕"
      }
    ],
    "material_policy": "use_only_input_assets"
  },
  "production_config": {
    "voiceover": {
      "enabled": true,
      "mode": "default",
      "provider": "bytedance_bigtts",
      "language": "zh",
      "volume": 2
    },
    "subtitles": {
      "enabled": true,
      "style": "douyin_clean_bottom",
      "source": "segments"
    },
    "bgm": {
      "enabled": false
    },
    "render": {
      "format": "mp4",
      "resolution": "1080x1920",
      "fps": 30
    }
  },
  "runtime_payload": {
    "input_structure": {
      "version": "C_segment_asset_bound",
      "script_source": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
      "asset_binding_source": "production_directive.segments[].preferredAssets"
    }
  }
}
```

---

## D 版：已跑通服务器实测上传 JSON

用途：作为当前真实已出片版本。

完整原始 JSON 在本机：

```text
D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\openstoryline-engine-request.json
```

服务器结果：

```text
/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343/final.mp4
```

特点：

- 已通过服务器链路真实出片。
- 已配置 `pixelle_clone` 和 `ref_audio`。
- Scene 强结构已经接近推荐方向。
- 素材绑定仍是自然语言 `materials`，不是稳定 `asset_id`。
- response 里 `openstoryline.voiceover` 为空，voiceover artifact 没有稳定回传。

D 版上传 JSON 关键结构如下：

```json
{
  "job_id": "soundsix_voiceclone_20260514_1343",
  "merchant_id": "soundsix",
  "draft_id": "soundsix-space-20260514",
  "content_variant_id": "voiceclone-v1",
  "instruction_text": "请严格使用我提供的 4 条竖版实拍素材制作一条约 45 秒的竖版短视频，不要搜索或引入外部素材。\n脚本已经锁定，按 Scene 1 到 Scene 6 的顺序剪辑；不要改写核心口播。\n必须生成克隆口播：调用 generate_voiceover，并使用 productionConfig.voiceover 中的 clone_enabled=true 和 ref_audio。\n字幕跟随每个 scene 的 subtitle/voiceover 节奏出现。\n最终必须调用 render_video，输出 final.mp4。",
  "workspace_dir": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/workspace",
  "output_dir": "/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343",
  "input_assets": [
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
      "asset_type": "video",
      "file_name": "01-storefront.mp4",
      "description": "素材 01 外立面、招牌、通道、发光入口"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
      "asset_type": "video",
      "file_name": "02-entrance.mp4",
      "description": "素材 02 入口台阶、草坪、门头、庭院过渡"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
      "asset_type": "video",
      "file_name": "03-yard.mp4",
      "description": "素材 03 户外草坪、白色桌椅、遮阳伞、墙绘树影"
    },
    {
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
      "asset_type": "video",
      "file_name": "04-drink.mp4",
      "description": "素材 04 室内桌面、杯子、近景氛围"
    }
  ],
  "execution_mode": "server_openstoryline_voiceclone_test",
  "script_text": "SOUNDSIX 小院空间探店视频脚本\n日期：2026-05-14\n目标平台：抖音 / 小红书竖版短视频\n目标时长：约 45 秒\n内容方向：实景探店 / 空间种草 / 到店咨询\n\n视频定位：用 4 条现有竖版实拍素材，制作一条“藏在楼群里的安静小院”探店视频。\n\n成片标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\n\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\n\n完整口播稿：\n路过这里，别急着走。\n不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。\n进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。\n你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。\n点一杯喝的，手机放旁边，节奏就会自然慢下来。\n如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。\n\n分镜脚本：按 Scene 1 到 Scene 6 锁定，详细字段见 production_directive.scenes。\n\n脚本来源：D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
  "production_directive": {
    "script_locked": true,
    "desired_outputs": ["final_video", "subtitles", "metadata"],
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "source_script_json": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/2026-05-14-soundsix-space-video-script.json",
    "source_script_md": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/2026-05-14-soundsix-space-video-script.md",
    "scenes": [
      {
        "sceneNo": 1,
        "timeRange": "00:00-00:04",
        "shotRequirement": "外立面或招牌快速带入，先让用户知道这是一个隐藏在楼群里的空间。",
        "visual": "从外立面、招牌或街区通道开始，镜头轻微推进。",
        "voiceover": "路过这里，别急着走。",
        "subtitle": "楼群里，藏着一个可以坐下来的小院",
        "materials": ["素材 01：8afac4f50ce7a3d2c8ed6888d77645b2.mp4，外立面招牌和入口"],
        "cameraMovement": "轻微推进，前 1 秒可加快一点节奏",
        "purpose": "用隐藏感制造开头停留。",
        "fallbackShot": "如果招牌不清楚，就用通道和门口发光入口做开场。"
      },
      {
        "sceneNo": 2,
        "timeRange": "00:04-00:10",
        "shotRequirement": "展示从外部走进入口的动线。",
        "visual": "拍入口台阶、门口装置、草坪边缘和门头。",
        "voiceover": "不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。",
        "subtitle": "走进去，才发现里面很安静",
        "materials": ["素材 02：dfc0bf31bc19aed4435d6aafb342ad5d.mp4，入口台阶、草坪、门头", "素材 01：8afac4f50ce7a3d2c8ed6888d77645b2.mp4，入口补充镜头"],
        "cameraMovement": "手持向前走，轻微上摇",
        "purpose": "把隐藏转成可抵达。",
        "fallbackShot": "若入口素材不够稳，用素材 01 后半段门口画面补足。"
      },
      {
        "sceneNo": 3,
        "timeRange": "00:10-00:18",
        "shotRequirement": "主体展示庭院空间。",
        "visual": "白色桌椅、玻璃桌面、草坪和空座位。",
        "voiceover": "进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。",
        "subtitle": "小草坪 + 户外座位，适合慢慢坐一会儿",
        "materials": ["素材 03：c4e75271ee4578766ba688f32fdb8af1.mp4，户外草坪、白色桌椅、玻璃桌"],
        "cameraMovement": "慢速横移，尽量保持画面平稳",
        "purpose": "建立空间感和松弛感。",
        "fallbackShot": "如果桌椅画面晃动，就截取素材 03 中靠近桌椅的稳定片段。"
      },
      {
        "sceneNo": 4,
        "timeRange": "00:18-00:26",
        "shotRequirement": "补充氛围细节。",
        "visual": "墙绘树影、遮阳伞、桌面反光、空椅子。",
        "voiceover": "你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。",
        "subtitle": "不吵、不挤，适合短暂放空",
        "materials": ["素材 03：c4e75271ee4578766ba688f32fdb8af1.mp4，墙绘树影、遮阳伞、空座位"],
        "cameraMovement": "慢推或固定机位停留 1 到 2 秒",
        "purpose": "把环境价值从好看转成用户为什么会想来。",
        "fallbackShot": "若墙绘不够清楚，可改用桌椅和草坪远景表达安静感。"
      },
      {
        "sceneNo": 5,
        "timeRange": "00:26-00:34",
        "shotRequirement": "用饮品或桌面近景承接坐下来。",
        "visual": "室内桌面、杯子、手部或桌边细节。",
        "voiceover": "点一杯喝的，手机放旁边，节奏就会自然慢下来。",
        "subtitle": "点一杯，坐下来，节奏慢一点",
        "materials": ["素材 04：344452508fd33cdc7f19cd869714b0cc.mp4，桌面杯子近景"],
        "cameraMovement": "近景固定或轻微下压，结尾留 0.5 秒停顿",
        "purpose": "从空间展示进入到店体验。",
        "fallbackShot": "如果杯子画面太短，可用素材 03 的玻璃桌面近景延长。"
      },
      {
        "sceneNo": 6,
        "timeRange": "00:34-00:45",
        "shotRequirement": "回到门店入口或庭院全景。",
        "visual": "门口发光入口、外立面招牌或庭院座位全景。",
        "voiceover": "如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
        "subtitle": "先收藏｜私信问定位和营业时间",
        "materials": ["素材 01：8afac4f50ce7a3d2c8ed6888d77645b2.mp4，门口入口", "素材 02：dfc0bf31bc19aed4435d6aafb342ad5d.mp4，入口台阶", "素材 03：c4e75271ee4578766ba688f32fdb8af1.mp4，庭院全景"],
        "cameraMovement": "先慢推，最后定格",
        "purpose": "把观看动作转成收藏和私信咨询。",
        "fallbackShot": "如果入口画面人物较多，就用空庭院全景做 CTA 背景。"
      }
    ],
    "material_policy": "use_only_input_assets"
  },
  "production_config": {
    "aspect_ratio": "9:16",
    "duration_seconds": 45,
    "voiceover": {
      "enabled": true,
      "provider": "pixelle_clone",
      "clone_enabled": true,
      "ref_audio": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a",
      "language": "zh"
    },
    "subtitles": {
      "enabled": true,
      "style": "douyin_clean_bottom",
      "source": "locked_script_scenes"
    },
    "bgm": {
      "enabled": false
    },
    "render": {
      "format": "mp4",
      "resolution": "1080x1920",
      "fps": 30
    }
  },
  "runtime_payload": {
    "source": "codex-server-run",
    "user_materials_only": true,
    "script_md_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/2026-05-14-soundsix-space-video-script.md",
    "local_script_md_path": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md"
  }
}
```

---

## E 版：推荐正式上传 JSON

用途：作为后续平台正式合同目标。

特点：

- `script`、`scenes`、`sceneAssetBindings`、`input_assets` 分层明确。
- 素材绑定使用稳定 `asset_id`，同时保留 `file_name` 给人看。
- 声音克隆使用 `mode: "cloned"`、`voice_profile_id`、`ref_audio_asset_id`。
- voiceover artifact 要求进入回传摘要，方便评分和排错。

```json
{
  "job_id": "soundsix_json_E_recommended_20260514",
  "merchant_id": "soundsix",
  "draft_id": "soundsix-space-20260514",
  "content_variant_id": "json-E-recommended",
  "instruction_text": "请按 production_directive.scenes 和 scene_asset_bindings 严格剪辑。只使用 input_assets 中的素材，不要搜索外部素材。必须生成克隆口播并回传 voiceover artifact 摘要。最终必须输出 final.mp4。",
  "workspace_dir": "/srv/jingjing-video-worker/tmp/soundsix-20260514-json-E/workspace",
  "output_dir": "/srv/jingjing-video-worker/outputs/soundsix_json_E_recommended_20260514",
  "execution_mode": "server_openstoryline_json_structure_test",
  "script": {
    "text": "SOUNDSIX 小院空间探店视频脚本\n日期：2026-05-14\n目标平台：抖音 / 小红书竖版短视频\n目标时长：约 45 秒\n内容方向：实景探店 / 空间种草 / 到店咨询\n\n视频定位：用 4 条现有竖版实拍素材，制作一条“藏在楼群里的安静小院”探店视频。\n\n成片标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\n\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\n\n完整口播稿：\n路过这里，别急着走。\n不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。\n进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。\n你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。\n点一杯喝的，手机放旁边，节奏就会自然慢下来。\n如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。\n\n分镜脚本：按 Scene 1 到 Scene 6 锁定，详细字段见 production_directive.scenes。",
    "locked": true,
    "version": "soundsix-script-v1",
    "title": "藏在楼群里的小院咖啡，适合慢下来坐一会儿",
    "cta": "先收藏｜私信问定位和营业时间"
  },
  "script_text": "SOUNDSIX 小院空间探店视频脚本\n脚本来源：D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md\n标题：藏在楼群里的小院咖啡，适合慢下来坐一会儿\n目标时长：约 45 秒\n前 3 秒钩子：路过这里，别急着走。楼群里面，藏着一个可以坐下来放空的小院。\nCTA：想找个不吵、能坐一会儿的地方，可以先收藏；来之前私信问定位和营业时间。\n完整口播和 Scene 1 到 Scene 6 均来自 D 版脚本真相源，详细字段见 production_directive.scenes。",
  "input_assets": [
    {
      "asset_id": "asset-video-01-storefront",
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/01-storefront.mp4",
      "asset_type": "video",
      "file_name": "01-storefront.mp4",
      "description": "素材 01 外立面、招牌、通道、发光入口"
    },
    {
      "asset_id": "asset-video-02-entrance",
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/02-entrance.mp4",
      "asset_type": "video",
      "file_name": "02-entrance.mp4",
      "description": "素材 02 入口台阶、草坪、门头、庭院过渡"
    },
    {
      "asset_id": "asset-video-03-yard",
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/03-yard.mp4",
      "asset_type": "video",
      "file_name": "03-yard.mp4",
      "description": "素材 03 户外草坪、白色桌椅、遮阳伞、墙绘树影"
    },
    {
      "asset_id": "asset-video-04-drink",
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/media/04-drink.mp4",
      "asset_type": "video",
      "file_name": "04-drink.mp4",
      "description": "素材 04 室内桌面、杯子、近景氛围"
    },
    {
      "asset_id": "asset-audio-voice-ref-20260513",
      "local_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a",
      "asset_type": "audio",
      "file_name": "voice-ref-20260513_164427.m4a",
      "description": "用户声音样本"
    }
  ],
  "production_directive": {
    "script_locked": true,
    "desired_outputs": ["final_video", "subtitles", "metadata", "voiceover_artifacts"],
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "target_platform": "douyin",
    "source_script_md": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/2026-05-14-soundsix-space-video-script.md",
    "local_source_script_md": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
    "material_policy": "use_only_input_assets",
    "locked_fields": ["script", "scenes", "voiceover", "cta"],
    "scenes": [
      {
        "sceneNo": 1,
        "timeRange": "00:00-00:04",
        "role": "opening_hook",
        "shotRequirement": "外立面或招牌快速带入，先让用户知道这是一个隐藏在楼群里的空间。",
        "visual": "从外立面、招牌或街区通道开始，镜头轻微推进。",
        "voiceover": "路过这里，别急着走。",
        "subtitle": "楼群里，藏着一个可以坐下来的小院",
        "cameraMovement": "轻微推进，前 1 秒可加快一点节奏",
        "purpose": "用隐藏感制造开头停留。",
        "fallbackShot": "如果招牌不清楚，就用通道和门口发光入口做开场。"
      },
      {
        "sceneNo": 2,
        "timeRange": "00:04-00:10",
        "role": "arrival_path",
        "shotRequirement": "展示从外部走进入口的动线。",
        "visual": "拍入口台阶、门口装置、草坪边缘和门头。",
        "voiceover": "不是商场里一眼看完的那种店，它更像一条小路走进去，才发现里面有点安静。",
        "subtitle": "走进去，才发现里面很安静",
        "cameraMovement": "手持向前走，轻微上摇",
        "purpose": "把隐藏转成可抵达。",
        "fallbackShot": "若入口素材不够稳，用素材 01 后半段门口画面补足。"
      },
      {
        "sceneNo": 3,
        "timeRange": "00:10-00:18",
        "role": "space_value",
        "shotRequirement": "主体展示庭院空间。",
        "visual": "白色桌椅、玻璃桌面、草坪和空座位。",
        "voiceover": "进来之后，最先看到的是这片小草坪和几组座位，人不多的时候，很适合慢慢坐一会儿。",
        "subtitle": "小草坪 + 户外座位，适合慢慢坐一会儿",
        "cameraMovement": "慢速横移，尽量保持画面平稳",
        "purpose": "建立空间感和松弛感。",
        "fallbackShot": "如果桌椅画面晃动，就截取素材 03 中靠近桌椅的稳定片段。"
      },
      {
        "sceneNo": 4,
        "timeRange": "00:18-00:26",
        "role": "atmosphere_detail",
        "shotRequirement": "补充氛围细节。",
        "visual": "墙绘树影、遮阳伞、桌面反光、空椅子。",
        "voiceover": "你可以和朋友聊一会儿，也可以一个人坐着发发呆。它不是热闹型的，更像一个临时躲开的角落。",
        "subtitle": "不吵、不挤，适合短暂放空",
        "cameraMovement": "慢推或固定机位停留 1 到 2 秒",
        "purpose": "把环境价值从好看转成用户为什么会想来。",
        "fallbackShot": "若墙绘不够清楚，可改用桌椅和草坪远景表达安静感。"
      },
      {
        "sceneNo": 5,
        "timeRange": "00:26-00:34",
        "role": "drink_closeup",
        "shotRequirement": "用饮品或桌面近景承接坐下来。",
        "visual": "室内桌面、杯子、手部或桌边细节。",
        "voiceover": "点一杯喝的，手机放旁边，节奏就会自然慢下来。",
        "subtitle": "点一杯，坐下来，节奏慢一点",
        "cameraMovement": "近景固定或轻微下压，结尾留 0.5 秒停顿",
        "purpose": "从空间展示进入到店体验。",
        "fallbackShot": "如果杯子画面太短，可用素材 03 的玻璃桌面近景延长。"
      },
      {
        "sceneNo": 6,
        "timeRange": "00:34-00:45",
        "role": "cta",
        "shotRequirement": "回到门店入口或庭院全景。",
        "visual": "门口发光入口、外立面招牌或庭院座位全景。",
        "voiceover": "如果你也想找一个不吵、能坐一会儿的地方，可以先收藏。来之前，私信问我定位和营业时间。",
        "subtitle": "先收藏｜私信问定位和营业时间",
        "cameraMovement": "先慢推，最后定格",
        "purpose": "把观看动作转成收藏和私信咨询。",
        "fallbackShot": "如果入口画面人物较多，就用空庭院全景做 CTA 背景。"
      }
    ],
    "scene_asset_bindings": [
      {
        "sceneNo": 1,
        "preferred": [
          {
            "asset_id": "asset-video-01-storefront",
            "file_name": "01-storefront.mp4",
            "role": "primary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-02-entrance",
            "file_name": "02-entrance.mp4",
            "role": "fallback"
          }
        ]
      },
      {
        "sceneNo": 2,
        "preferred": [
          {
            "asset_id": "asset-video-02-entrance",
            "file_name": "02-entrance.mp4",
            "role": "primary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-01-storefront",
            "file_name": "01-storefront.mp4",
            "role": "fallback"
          }
        ]
      },
      {
        "sceneNo": 3,
        "preferred": [
          {
            "asset_id": "asset-video-03-yard",
            "file_name": "03-yard.mp4",
            "role": "primary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-02-entrance",
            "file_name": "02-entrance.mp4",
            "role": "fallback"
          }
        ]
      },
      {
        "sceneNo": 4,
        "preferred": [
          {
            "asset_id": "asset-video-03-yard",
            "file_name": "03-yard.mp4",
            "role": "primary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-04-drink",
            "file_name": "04-drink.mp4",
            "role": "fallback"
          }
        ]
      },
      {
        "sceneNo": 5,
        "preferred": [
          {
            "asset_id": "asset-video-04-drink",
            "file_name": "04-drink.mp4",
            "role": "primary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-03-yard",
            "file_name": "03-yard.mp4",
            "role": "fallback"
          }
        ]
      },
      {
        "sceneNo": 6,
        "preferred": [
          {
            "asset_id": "asset-video-01-storefront",
            "file_name": "01-storefront.mp4",
            "role": "primary"
          },
          {
            "asset_id": "asset-video-03-yard",
            "file_name": "03-yard.mp4",
            "role": "secondary"
          }
        ],
        "fallback": [
          {
            "asset_id": "asset-video-02-entrance",
            "file_name": "02-entrance.mp4",
            "role": "fallback"
          }
        ]
      }
    ]
  },
  "production_config": {
    "aspect_ratio": "9:16",
    "duration_seconds": 45,
    "voiceover": {
      "enabled": true,
      "mode": "cloned",
      "provider": "pixelle_clone",
      "clone_enabled": true,
      "voice_profile_id": "voice-profile-soundsix-owner-v1",
      "ref_audio_asset_id": "asset-audio-voice-ref-20260513",
      "ref_audio": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a",
      "language": "zh",
      "volume": 2,
      "speed": 1
    },
    "subtitles": {
      "enabled": true,
      "style": "douyin_clean_bottom",
      "source": "locked_script_scenes"
    },
    "bgm": {
      "enabled": false
    },
    "render": {
      "format": "mp4",
      "resolution": "1080x1920",
      "fps": 30,
      "include_original_audio": false
    }
  },
  "runtime_payload": {
    "source": "json-structure-comparison",
    "trace_id": "soundsix-json-E-20260514",
    "user_materials_only": true,
    "script_md_path": "/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/2026-05-14-soundsix-space-video-script.md",
    "local_script_md_path": "D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md",
    "expected_artifacts": {
      "final_video": "final.mp4",
      "subtitles": "subtitles.srt",
      "metadata": "firered-run-metadata.json",
      "voiceover": {
        "required": true,
        "summary_fields": ["provider", "mode", "voice_profile_id", "segments", "used_in_render"]
      }
    }
  }
}
```

## E 版相对 D 版的核心变化

| 项目 | D 版现状 | E 版建议 |
| --- | --- | --- |
| 素材绑定 | `materials` 是自然语言和文件名混写 | `scene_asset_bindings` 使用稳定 `asset_id` |
| 声音克隆 | `provider + clone_enabled + ref_audio` | 增加 `mode: cloned`、`voice_profile_id`、`ref_audio_asset_id` |
| artifact 回传 | response 里 `openstoryline.voiceover` 为空 | 明确要求 `voiceover_artifacts` 和摘要字段 |
| 前端对应 | 还没有正式音色选择入口 | 对应个人可复用音色库 |
| 评分能力 | 很难自动确认克隆音频是否参与 render | 可以按 artifact 和 render metadata 复盘 |
