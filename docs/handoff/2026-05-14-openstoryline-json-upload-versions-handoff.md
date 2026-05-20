# 2026-05-14 OpenStoryline JSON 上传版本对比 Handoff

## 当前目标

围绕 OpenStoryline/FireRed 视频出片链路，先把 A/B/C/D/E 每一版“上传给服务器或 OpenStoryline 链路的 JSON 长什么样”沉淀成文档。

本轮重点不是继续生成视频，也不是马上改前端/worker，而是先统一 JSON 版本定义，方便后续做对比评分 MD 和最终 HTML。

## 已完成内容

新增文档：

- `docs/test/2026-05-14-openstoryline-json-upload-versions.md`

该文档已经包含：

- A/B/C/D/E 五版上传 JSON 示例。
- 固定素材和声音克隆参考音频说明。
- 线上素材口径：当前线上素材暂时按 Pexels，不泛称为 OpenStoryline 自找素材。
- D 版脚本真相源：
  - `docs/探索/2026-05-14-soundsix-space-video-script.md`
- A/B/C/E 均已改为依赖 D 版脚本派生，不再使用独立示例脚本。
- D 版与 C 版、E 版的区别说明。
- 最新用户口径：A/E 使用克隆声音，B/C 使用普通 TTS 配音；素材目录为 `D:\Desktop\测试素材`。

## 关键口径

### A/B/C/D/E 的定位

- A：弱结构基线 + 克隆声音。只给完整口播 + 自然语言要求，看 OpenStoryline 自己理解能力，同时测克隆声音基础链路。
- B：口播段落结构 + 普通 TTS 配音。在 A 基础上拆 `segments`，看字幕、顺序、段落理解是否变稳。
- C：段落 + 文件名素材绑定 + 普通 TTS 配音。在 B 基础上增加 `preferredAssets/fallbackAssets/editHint`，验证素材绑定是否提升画面贴合。
- D：真实跑通基线。上一轮服务器真实出片使用的 JSON，请求文件来自：
  - `.tmp/server-videos/soundsix_voiceclone_20260514_1343/openstoryline-engine-request.json`
- E：推荐正式合同 + 克隆声音。在 D 的真实基线基础上补齐工程化字段：
  - `scene_asset_bindings`
  - `asset_id`
  - `voice_profile_id`
  - `ref_audio_asset_id`
  - `voiceover_artifacts`

### D 版与 C 版区别

C 版是“设计出来的测试输入”，D 版是“服务器真实跑通过的当前输入”。

- C 用 `segments[]`。
- D 用 `production_directive.scenes[]`。
- C 的素材绑定是 `preferredAssets/fallbackAssets`，按文件名指定。
- D 的素材绑定是 `materials[]`，自然语言描述素材用途。
- C 还没证明能跑通。
- D 已经跑出 `final.mp4`，但缺少稳定 `asset_id` 和 voiceover artifact 回传。

### D 版与 E 版区别

D 版能跑通，但不够工程可验收。

E 版不是重新设计脚本，而是把 D 跑通后的经验工程化：

- 把自然语言 `materials` 升级为稳定 `scene_asset_bindings`。
- 把声音克隆从 `provider + ref_audio` 升级为 `mode + voice_profile_id + ref_audio_asset_id`。
- 把 voiceover artifact 纳入回传和评分闭环。

## 相关文件状态

本轮相关新增/更新：

- `docs/test/2026-05-14-openstoryline-json-upload-versions.md`
- `docs/handoff/2026-05-14-openstoryline-json-upload-versions-handoff.md`

上下文相关但不是本轮 handoff 主要产物：

- `docs/test/2026-05-14-openstoryline-koubo-json-test-plan.md`
- `docs/探索/2026-05-14-soundsix-space-video-script.md`
- `docs/探索/2026-05-14-soundsix-space-video-script.json`
- `docs/progress/2026-05-14-soundsix-openstoryline-server-voiceclone-progress.md`
- `.tmp/server-videos/soundsix_voiceclone_20260514_1343/`

注意：当前工作区已有其它未提交改动，例如：

- `docs/README.md`
- `workers/video-worker/openstoryline/app/engine_adapters.py`

这些不是本次“写 handoff”请求产生的，不要误删或回退。

## 当前分支 / worktree

- 当前分支：`孟_5.13`
- 未创建新分支。
- 未提交 commit。
- 未 push。
- 未 merge。

## 验证结果

已做的轻量检查：

- 确认 `docs/test/2026-05-14-openstoryline-json-upload-versions.md` 存在。
- 检查到 A/B/C/D/E 标题均在文档中。
- 检查到 D 版脚本来源已多处写入：
  - `D:/codexplan/personal/jingjing-content-platform/docs/探索/2026-05-14-soundsix-space-video-script.md`

未做：

- 未运行 app typecheck/lint。
- 未运行 worker 测试。
- 未生成对比 HTML。
- 未继续改前端声音克隆入口。
- 未补 worker voiceover artifact 回传代码。

## 下一步建议

1. 继续完善评分文档：
   - 目标文件建议：`docs/test/2026-05-14-openstoryline-json-structure-comparison.md`
   - 按 A/B/C/D/E 评分：结构稳定性、OpenStoryline 可理解性、素材可控性、字幕/口播同步、声音克隆可追踪、排错能力。

2. 等评分口径稳定后生成 HTML：
   - 目标文件建议：`docs/test/2026-05-14-openstoryline-json-structure-comparison.html`

3. 如果继续产品/工程实现，再拆成三块：
   - 前端声音克隆入口：系统配音 / 我的克隆音色、录音、上传音频、授权确认。
   - 后端音色库：`voice_profiles`、`audio` asset、权限校验。
   - worker/OpenStoryline：voiceover artifact 摘要回传。

## 风险与注意

- A/B/C/D/E 的脚本必须继续保持同一份 D 版脚本，否则对比会失真。
- A/E 使用克隆声音，B/C 使用普通 TTS 配音；不要把声音变量再混在一起。
- 本地素材目录以 `D:\Desktop\测试素材` 为准，当前包含 4 个 MP4 和 1 个 M4A。
- Pexels 只能作为“线上素材路径”单独对比，不要混入固定素材对比。
- D 版 response 当前没有稳定 voiceover artifact，不能仅凭 response 断言完整视频音轨一定来自克隆音频；只能说配置使用了克隆，且 smoke test 证明克隆链路可用。
- 若后续真的跑 A/B/C/E 视频，请每个版本独立 session，避免 OpenStoryline 上下文污染。
