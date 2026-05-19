# 2026-05-16 domestic clean release handoff

## 1. Current status

Status: clean release and minimum self-hosted regression passed; normal FireRed
still blocked.

Final branch:

- worktree:
  `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- branch: `codex/domestic-infra-migration`
- final local HEAD: `e28791c`
- push: no
- merge to `main`: no

Long-task / Phase 1:

- `.codex/long-task/active.json` remains `blocked`.
- `DOMESTIC_PHASE1_E2E_PASS` was not written.
- Domestic Phase 1 should not be marked complete.

## 2. Remote current release

Final current release:

- `/srv/jingjing-selfhost-rehearsal/current`
- target:
  `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`

Why this is not `fdcde3a` anymore:

- Required `fdcde3a` clean release was created and passed the minimum
  self-hosted regression.
- Normal FireRed debugging found and fixed two `generate_script` issues.
- Those fixes changed HEAD to `e28791c`.
- The final current release was rebuilt from a clean `git archive` of
  `e28791c` and redeployed.

The original required clean release remains on the server:

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T052337Z-fdcde3a-clean`

## 3. What passed

On the `fdcde3a` clean release:

- `/api/health`
- app env preflight
- COS roundtrip
- team invite + Dify mock
- video-chain API smoke
- worker fast-path smoke

On the final `e28791c` clean release:

- fresh app build
- app health
- worker/OpenStoryline/FireRed rebuild/restart
- worker fast-path smoke

Final fast-path proof:

```text
jobId: 731d6aa9-83f2-4a5a-ad74-8b1e9ecf2258
finalJobStatus: succeeded
finalStage: completed
resultAssetCount: 1
previewStatus: 200
previewBytes: 3693
selfHostedFastPath: true
```

## 4. Normal FireRed result

Normal FireRed did not pass.

Attempts:

1. `44ede6cf-5efe-46b5-b317-111beac37bc9`
   - release: `fdcde3a`
   - failed stage: `normal_firered_generate_script_timeout_observed`
   - finding: locked script was still routed through LLM script generation.

2. `1ef544df-1b0d-4ade-a8f6-e1a8b620406e`
   - release: `51e760f`
   - failed stage: `normal_firered_custom_script_shape_timeout_observed`
   - finding: agent sent `{title, subtitle_units}` rather than
     `{title, group_scripts}`.

3. `c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5`
   - release: `e28791c`
   - failed stage: `normal_firered_tts_param_inference_timeout_observed`
   - finding: `generate_script` issues are fixed, but normal path stalls at
     `generate_voiceover`, while inferring TTS parameters for `provider=bytedance`.

Remote logs:

- `/srv/jingjing-selfhost-rehearsal/logs/20260516-fdcde3a-normal-firered-44ede6cf-5efe-46b5-b317-111beac37bc9/`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-51e760f-normal-firered-1ef544df-1b0d-4ade-a8f6-e1a8b620406e/`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-e28791c-normal-firered-c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5/`

Each directory contains:

- `video-worker.log`
- `openstoryline-engine.log`
- `firered-openstoryline.log`

## 5. Code changes in e28791c

Changed:

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py`
- `workers/video-worker/tests/test_firered_generate_script_locked.py`

Behavior:

- `GenerateScriptNode` bypasses LLM regeneration when a worker request contains
  `Use the locked script:`.
- It also normalizes FireRed agent's real `{title, subtitle_units}` payload into
  valid `group_scripts`.

Validation:

```bash
python3 -m unittest workers/video-worker/tests/test_firered_generate_script_locked.py
python3 -m compileall workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py workers/video-worker/tests/test_firered_generate_script_locked.py
git diff --check
```

## 6. Next recommended action

Do not spend more time on `generate_script`; that blocker has moved.

Next debug target:

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_voiceover.py`
- specifically `_infer_tts_params_with_llm`
- current keepalive:
  `inferring TTS parameters for provider=bytedance`

Decision needed:

1. If normal production smoke must include voiceover, verify TTS provider config
   and LLM sampling/runtime evidence for `generate_voiceover`.
2. If normal infrastructure smoke may skip voiceover, add an explicit
   production config for the normal smoke that disables voiceover and separately
   validates render/upload/preview.

Until one of those is done, normal FireRed remains blocked and domestic Phase 1
must remain blocked.
