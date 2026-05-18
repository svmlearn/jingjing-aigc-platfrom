# 2026-05-16 CASE-003 Real Chain Result

## Scope

- Test case: `docs/test/2026-05-15-video-script-completeness-test-cases.md` CASE-003.
- Job ID: `affac3f4-e4ab-4ea0-abad-29038dae4a60`.
- Constraint summary: no push, no local FFmpeg final generation, no skeleton/placeholder output, natural remote chain only, clone voice via RunningHub `pixelle_clone`, talking-head source audio muted.

## Result

- Supabase status: `succeeded`.
- Final stage: `completed`.
- Finished at: `2026-05-16 10:13:35.660098+00`, i.e. `2026-05-16 18:13:35 +08:00`.
- Render summary: `Video generated successfully, duration: 48.488 seconds`.
- COS outputs:
  - `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/affac3f4-e4ab-4ea0-abad-29038dae4a60/final.mp4`
  - `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/affac3f4-e4ab-4ea0-abad-29038dae4a60/cover.jpg`
  - `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/affac3f4-e4ab-4ea0-abad-29038dae4a60/subtitles.srt`

## Server Runtime Summary

处理耗时：36分31秒
成片时长：48.488秒
分辨率：608x1080
最终成片：output_9452c8de_1778926259435.mp4

## Local Artifact Location

Official 2026-05-16 artifact directory:

`D:\Desktop\测试素材\cos素材库入库包_20260516\metadata\case_003_artifacts`

Do not use the 2026-05-15 package as evidence for this run. 20260515 and 20260516 are separate packages.

Key hashes:

| File | Bytes | SHA256 |
|---|---:|---|
| `cos\final.mp4` | 11414542 | `2E003564CECF1EDDEB7A4D1492C51E7BC9FFCFB5CC6872052CBE90C7392DDEEC` |
| `cache\render_output.mp4` | 11414542 | `2E003564CECF1EDDEB7A4D1492C51E7BC9FFCFB5CC6872052CBE90C7392DDEEC` |
| `cos\cover.jpg` | 46790 | `39ECE5376ADE616C76FB6D4C1C6CB673A96FFE9E5649FD48516BDC8405C8D689` |
| `cos\subtitles.srt` | 1468 | `68CE587B6BE6CF928041264EEEE0744AFF8C42E36D5413E483D45F3DBD909B32` |

`cos\final.mp4` and `cache\render_output.mp4` are byte-identical by SHA256.

## Route Evidence

- Input payload voiceover config:
  - `provider=pixelle_clone`
  - `cloneEnabled=true`
  - ref audio: `voice-profiles/00000000-0000-4000-8000-000000000001/case-003/20260513_164427.m4a`
- Firered logs:
  - `storyline.generate_voiceover args` used `provider='pixelle_clone'`.
  - RunningHub clone workflow ID detected and executed: `1983718528991862786`.
  - Generated `voiceover_0001` through `voiceover_0006`.
- Local evidence files:
  - `evidence\generate_voiceover_1778924810.json`
  - `voiceover\voiceover_0001_1778924810782.wav` through `voiceover_0006_1778924810782.wav`

## Talking-Head Audio Policy

Render arguments confirm source video audio was muted:

- `include_video_audio=false`
- `video_volume_scale=0`
- `audio_policy=mute_source_for_talking_head_voiceover`

Evidence file:

`evidence\render_video_1778926259.json`

## Deprecated-Link Findings

Runtime log counts from `evidence\compose_logs_since_0935Z.txt`:

| Pattern | Count |
|---|---:|
| `pixelle_clone` | 3 |
| `1983718528991862786` | 36 |
| `1983513964837543938` | 0 |
| `minmax/minimax` | 0 |
| `rhart` | 0 |
| `voice-clone` | 0 |
| `/voice-clone` | 0 |
| `Deprecated/deprecated` | 0 |

Source grep under `workers/video-worker/openstoryline`, `workers/video-worker/worker`, and `workers/video-worker/tests` found no `rhart-audio`, `/voice-clone`, or `voice-clone` legacy route references.

## Timing Note

At `2026-05-16 17:54 +08:00`, the run had already exceeded the expected wait and was not complete. It later resumed past `select_bgm`, entered `render_video`, and succeeded at `2026-05-16 18:13:35 +08:00`.

## 20260515 / 20260516 Separation

A download attempt briefly wrote 25 current-run files into:

`D:\Desktop\测试素材\cos素材库入库包_20260515\metadata\case_003_artifacts`

Those files were moved, not deleted, into the 20260516 audit folder:

`D:\Desktop\测试素材\cos素材库入库包_20260516\metadata\case_003_artifacts\_misdrop_removed_from_20260515`

Cleanup evidence:

- `cleanup_manifest.json` records all 25 moved files.
- Post-clean verification found current job reference count in the 20260515 artifact directory is `0`.
- Remaining 20260515 file count is `14`.

## Push / Merge

- No push was performed.
- No git merge was performed during this verification/download step.
