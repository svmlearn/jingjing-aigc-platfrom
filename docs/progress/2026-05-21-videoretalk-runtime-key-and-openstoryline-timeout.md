# 2026-05-21 VideoRetalk runtime key and OpenStoryline timeout note

## Scope

- Server: `8.154.28.41`
- SSH user used: `meng`
- Runtime env file: `/srv/jingjing-domestic/shared/env/worker.env`
- Related services:
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`

## VideoRetalk configuration

The user provided an Aliyun DashScope / VideoRetalk key for lip-sync. The key was written only to the server runtime env file and is not recorded in this repository.

Configured runtime variables:

```text
OPENSTORYLINE_LIP_SYNC_PROVIDER=aliyun_videoretalk
ALIYUN_VIDEORETALK_BASE_URL=https://dashscope.aliyuncs.com/api/v1
ALIYUN_VIDEORETALK_API_KEY=<redacted; configured on server>
ALIYUN_VIDEORETALK_MODEL=videoretalk
ALIYUN_VIDEORETALK_TIMEOUT_SECONDS=900
ALIYUN_VIDEORETALK_POLL_INTERVAL_SECONDS=15
```

Backup created before editing:

```text
/srv/jingjing-domestic/shared/env/worker.env.bak-videoretalk-20260521204309
```

After editing, the three services were restarted.

## Verification

Service status after restart:

```text
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

OpenStoryline readiness check returned ready with FireRed enabled:

```text
status=ready
service=openstoryline-engine
engine_adapter=fire_red
fire_red_base_url_configured=true
fire_red_provider_key_configured=true
fire_red_ready.provider_key_configured=true
runtime_assets.transnet_weights=true
runtime_assets.bgms=true
runtime_assets.fonts=true
runtime_assets.font_info=true
runtime_assets.tts_providers=true
runtime_assets.outputs=true
```

## Timeout diagnosis

The earlier failure was:

```text
failed to run OpenStoryline engine: OpenStoryline stream run timeout after 2700s
```

Observed server logs:

- `2026-05-21 18:58:49 CST`: worker claimed job `587fbfee-9e3e-44b1-8c66-b5ca3a378d57`.
- `2026-05-21 19:44:03 CST`: worker marked the job failed because the OpenStoryline stream exceeded the worker-side `2700s` timeout.
- FireRed/OpenStoryline logs showed the run had reached `select_bgm`.
- `select_bgm` hit `model sampling timed out after 450s`.
- Later logs showed delayed model responses arriving after the MCP request/session had already timed out, producing an `unknown request ID` symptom.

Conclusion: the `2700s` failure is currently a FireRed/OpenStoryline execution-timeout problem around BGM model sampling/session handling. It is not caused by the missing VideoRetalk key. The VideoRetalk key is still necessary for later `lip_sync` execution once the run reaches that stage.

## Next step

Do not reuse the failed job as a success artifact. For the next validation, create a fresh `video_edit_jobs` row and rerun after deciding how to handle the `select_bgm` timeout path, for example by making BGM selection deterministic/fail-fast or by fixing the MCP sampling timeout/session behavior.
