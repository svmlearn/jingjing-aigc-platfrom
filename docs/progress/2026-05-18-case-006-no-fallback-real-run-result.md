# 2026-05-18 CASE-006 No-Fallback Real Run Result

## Scope

- Test case: `docs/test/2026-05-15-video-script-completeness-test-cases.md` CASE-006 `小院咖啡-仅主题版`.
- Merchant: `孟的小店`.
- Server: `43.160.208.189:/srv/jingjing-video-worker`.
- Database: linked cloud Supabase project `jingjing-content-platform-staging`.
- User uploaded talking-head inputs:
  - `draft-inputs/00000000-0000-4000-8000-000000000001/case-003/intro-koubo-1.mp4`
  - `draft-inputs/00000000-0000-4000-8000-000000000001/case-003/outro-koubo-2.mp4`
- Voice clone reference:
  - `voice-profiles/00000000-0000-4000-8000-000000000001/case-003/20260513_164427.m4a`

## Hard Constraint

CASE-006 now has an explicit hard acceptance rule in the test document:

- No fallback, no mock, no skeleton, no local fake generation.
- No "failed filter_clips then use all clips" path.
- If material matching, model filtering, voice cloning, subtitles, or render fails, the job must be marked failed and the failure reason must be recorded.
- A rerun must create a new `video_edit_jobs` row instead of reusing an old failed job.

## Cancelled Run

- Cancelled job: `b2f01aff-20b7-4a87-b1d1-3c512211736a`.
- Reason: FireRed reached `filter_clips`, but model sampling timed out in the previous runtime window.
- Final status: `cancelled`.
- Final stage: `cancelled_after_filter_clips_timeout_before_no_fallback_rerun`.
- This job is not used as the CASE-006 result.

## Server Runtime Change

To preserve the no-fallback rule while allowing the real model filter to finish, the server FireRed config was rebuilt with a wider LLM sampling window:

- `openstoryline/firered/config.toml`: `[llm].timeout = 900.0`, `[llm].max_retries = 1`
- `openstoryline/firered/config.video_edit_engine.toml`: `[llm].timeout = 900.0`, `[llm].max_retries = 1`
- `firered-openstoryline` was rebuilt and restarted.
- `filter_clips.py` was not changed; failure still raises an error.

## Successful Run

- Job ID: `3d16cca0-a506-4e3c-b52c-d1d8771406e1`.
- Supabase status: `succeeded`.
- Final stage: `completed`.
- Started at: `2026-05-18 02:36:45.95408+00`.
- Finished at: `2026-05-18 02:56:06.697931+00`.
- Engine adapter: `fire_red`.
- FireRed session ID: `35e786ef96e94eb8983ddd6bf944ae26`.
- Render log summary: video generated successfully, duration `54.264` seconds.
- Voiceover artifact summary:
  - provider: `pixelle_clone`
  - segment count: `7`
  - total duration: `44,991 ms`

## COS Outputs

Bucket: `jj-content-staging-1341668543`

| Type | COS key | Bytes | Asset ID |
|---|---|---:|---|
| final video | `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/3d16cca0-a506-4e3c-b52c-d1d8771406e1/final.mp4` | 12,964,138 | `e67eec43-9449-470f-8c0c-a7ca9f78dece` |
| cover | `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/3d16cca0-a506-4e3c-b52c-d1d8771406e1/cover.jpg` | 45,001 | `a5559c10-df33-4c0f-938b-1451791d57b3` |
| subtitles | `video-results/20718e4e-2853-4dc8-bebe-30c0ace47857/3d16cca0-a506-4e3c-b52c-d1d8771406e1/subtitles.srt` | 522 | `64986a8c-ea1d-4aa6-aa86-a75be656b0da` |

## Route Evidence

- `filter_clips` completed successfully and reported `Successfully filtered 9 clips`.
- `group_clips` completed successfully and reported `Grouping successful: 7 groups in total`.
- `generate_voiceover` used `provider='pixelle_clone'` with the COS reference audio downloaded into the job workspace.
- RunningHub clone workflow `1983718528991862786` executed and generated `voiceover_0001` through `voiceover_0007`.
- `render_video` ran with:
  - `aspect_ratio='9:16'`
  - `include_video_audio=false`
  - `video_volume_scale=0`
  - `bgm_volume_scale=0.18`
  - `tts_volume_scale=2`
- Worker uploaded `final.mp4`, `cover.jpg`, and `subtitles.srt` to COS.

## Push / Merge

- No push was performed.
- No merge was performed.
