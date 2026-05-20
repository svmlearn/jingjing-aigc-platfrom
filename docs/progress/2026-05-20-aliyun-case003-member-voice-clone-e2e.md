# 2026-05-20 Aliyun CASE-003 member voice-clone E2E

## Scope

Validate one and only one Web-triggered member video edit run for CASE-003 from `脚本测试.md`: Dify generated script reuse, member Web-uploaded videos, existing ready voice profile, ASR original talking-head source, pixelle clone TTS, FireRed/OpenStoryline render, Aliyun OSS result delivery.

No retry or replacement run was created for this validation.

## Release

- Branch: `codex/domestic-infra-migration`
- Gitee HEAD deployed: `e5c8e18a8a1a8d7321cf7c0d4b85506fee37d53a`
- Release: `/srv/jingjing-domestic/releases/20260520143000-e5c8e18`
- Runtime timeout config:
  - `OPENSTORYLINE_TIMEOUT_SECONDS=2700`
  - `FIRERED_RUN_TIMEOUT_SECONDS=2700`
- Services after deploy: app, video worker, OpenStoryline engine, FireRed OpenStoryline all active.
- Health: `/api/health` ok, DB `postgres`, storage `aliyun_oss`.

## Script Seeding

Updated the current verification daily task/draft/variant to CASE-003.

- daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
- content draft id: `bce1e108-5b9a-4387-96bd-de155707ef0b`
- content variant id: `3a228828-9506-4525-b013-f2d994213a38`
- title: `CASE-003 小院咖啡-无素材指定版`
- script md5: `51951e94e655a3221a52fc00aec4a43c`
- script locked in job: `true`

Only the script package and variant text were updated. Materials and voice/audio selection stayed Web-driven.

## Job Result

- video job id: `6bff73c4-d129-4206-bfbc-e653825bc098`
- status: `succeeded`
- stage: `completed`
- member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
- merchant id: `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`
- created: `2026-05-19T20:22:11.990Z`
- finished: `2026-05-19T20:54:47.143Z`

Input payload checks:

- Dify draft/variant reused: `bce1e108-5b9a-4387-96bd-de155707ef0b` / `3a228828-9506-4525-b013-f2d994213a38`
- script md5: `51951e94e655a3221a52fc00aec4a43c`
- `productionConfig.voiceover.mode`: `voice_profile`
- voice profile id: `0d2ab9f3-d339-431b-be27-3455551f084a`
- ref audio asset id: `541f58ee-a9bd-49fb-b05a-d73ec20be2c5`
- ref audio key: `draft-inputs/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/0d2ab9f3-d339-431b-be27-3455551f084a/voice-profile-audio/11d9b9b9-1005-4fef-abe9-01e7b9f45300-20260513_164427.m4a`
- ref audio size: `671495` bytes, `audio/mp4`
- `productionConfig.subtitles.talkingHeadSource`: `asr_original_audio`
- Web-uploaded user video inputs in persisted payload: `2`
- worker runtime inputs: `6` total = `2` user videos + `4` merchant material library videos
- merchant material asset ids: `fa3b7b4a-cb4f-4282-a1e3-ff7063f478fd`, `9eba31e8-9776-48e3-9a24-bbe2c21073c0`, `f2d3b3ea-4750-44fd-99e2-bd9d5816647a`, `753f9de3-03e2-492e-bc50-302dc883721f`
- Checked app journal and nginx access logs for the validation window; no `/api/content/video-workbench-agent` call was observed.

## FireRed Evidence

- FireRed session id: `504a4e22f6ea4d659d84d687233d9c6c`
- `filter_clips`: completed normally; no all-clips fallback accepted.
- `local_asr`: executed successfully before `generate_script`.
- `generate_script`: completed successfully after ASR dependency.
- TTS service: `pixelle_clone`.
- RunningHub workflow id: `1983718528991862786`.
- Clone voiceover: 6 segments generated successfully.
- Voiceover artifacts in OpenStoryline result: 6 items, all `clone=true`, provider `pixelle_clone`, durations `4168`, `7628`, `2844`, `7361`, `7361`, `9520` ms.
- `plan_timeline_pro`: completed and saved result.
- `render_video`: completed, generated 51.849s MP4.

There was a later `elementrec_text` sampling timeout log after render, but the job ultimately returned, uploaded outputs, and was marked `succeeded`.

## Output Assets

Final video:

- asset id: `4857390c-cac8-41fa-b8c6-d1f30b48bada`
- key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/6bff73c4-d129-4206-bfbc-e653825bc098/final.mp4`
- size: `9611861` bytes
- mime: `video/mp4`

Cover:

- asset id: `8029caf8-2f3b-4b95-be4d-58df87fa36d6`
- key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/6bff73c4-d129-4206-bfbc-e653825bc098/cover.jpg`
- size: `53759` bytes

Subtitles:

- asset id: `cf8e7f3a-a6fe-4242-859b-d7103bf6f90e`
- key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/6bff73c4-d129-4206-bfbc-e653825bc098/subtitles.srt`
- size: `1753` bytes

Preview/download verification for final video:

- preview signed read: HTTP `200`, `9611861` bytes, `video/mp4`
- download signed read: HTTP `200`, `9611861` bytes, `video/mp4`

## Conclusion

CASE-003 member Web-triggered voice clone E2E passed for this single run. The verified chain was:

`CASE-003 Dify generated script -> /member/video/:taskId -> Web-uploaded user materials -> ready voice_profile -> video_edit_job -> local_asr -> pixelle clone TTS -> timeline -> render -> Aliyun OSS video-results/* -> preview/download 200`.
