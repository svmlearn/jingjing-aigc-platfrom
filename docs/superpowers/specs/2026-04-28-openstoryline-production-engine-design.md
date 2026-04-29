# OpenStoryline Production Engine Integration Design

## Goal

Integrate the full FireRed OpenStoryline production engine behind the existing
`video_edit_jobs` worker contract, so platform video tasks can use real media
understanding, voiceover, BGM, subtitles, timeline planning, rendering, and
later revision while keeping business permissions, script locking, job state,
and output storage controlled by this platform.

## Current State

The current worker-facing engine is `openstoryline-engine` under
`workers/video-worker/openstoryline`. Its default adapter is `skeleton`, which
keeps the `/v1/runs` contract alive and writes placeholder outputs. It does not
generate real TTS, choose BGM, or execute the full OpenStoryline node graph.

The FireRed source is vendored under
`workers/video-worker/openstoryline/firered`. That code includes nodes for
voiceover generation, BGM selection, timeline planning, subtitles, and final
rendering. However, runtime assets such as `resource/bgms`,
`resource/tts/tts_providers.json`, models, and local outputs are intentionally
excluded from git and must be downloaded or mounted on the server.

The platform already creates `video_edit_jobs` with a locked script payload.
That payload is intentionally lightweight and currently lacks structured
voiceover, BGM, subtitle, render, and revision settings.

## Recommended Approach

Keep `video_edit_jobs` as the only business entry point and run FireRed
OpenStoryline as a private production engine behind the existing worker.

The frontend and business API should not call FireRed directly. The platform
creates and tracks jobs. The worker downloads assets, calls
`openstoryline-engine /v1/runs`, and uploads generated outputs. The engine
adapter maps the platform production contract into FireRed's private
`/api/worker/runs` endpoint.

This keeps the full OpenStoryline capability available while preventing users
or frontend code from bypassing script approval, merchant isolation, storage
rules, retry policy, and cost controls.

## Runtime Architecture

```text
Merchant confirms video script
-> Next.js API creates video_edit_jobs row
-> video-worker claims pending job
-> worker downloads input assets from COS
-> worker calls openstoryline-engine /v1/runs
-> fire_red adapter calls FireRed /api/worker/runs
-> OpenStoryline executes production nodes
-> FireRed returns final video path and metadata
-> worker validates outputs
-> worker uploads final video, cover, and subtitles to COS
-> platform reads job status and output asset_objects
```

## Adapter Modes

The engine keeps two adapter modes:

- `skeleton`: default contract-preserving placeholder runtime for local smoke
  tests and safe fallback.
- `fire_red`: real production runtime that requires the FireRed service,
  shared provider key, model credentials, and runtime assets.

Deployment must expose the selected adapter through `/health`, including
whether FireRed base URL and provider key are configured, without exposing
secret values.

## Production Contract

Extend `video_edit_jobs.input_payload` with a structured `productionConfig`
object. The current locked script and `productionDirective` remain required.

```ts
type ProductionConfig = {
  voiceover: {
    enabled: boolean;
    provider: "bytedance_bigtts" | "minimax" | "302";
    voiceStyle?: string;
    speed?: number;
    volume?: number;
  };
  bgm: {
    enabled: boolean;
    userRequest?: string;
    include?: {
      mood?: string[];
      scene?: string[];
      genre?: string[];
      lang?: string[];
    };
    exclude?: {
      mood?: string[];
      scene?: string[];
      genre?: string[];
      lang?: string[];
      id?: Array<string | number>;
    };
    volume?: number;
  };
  subtitles: {
    enabled: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render: {
    aspectRatio: "9:16";
    maxDurationSeconds?: number;
    includeOriginalAudio?: boolean;
  };
};
```

Defaults should be conservative:

- voiceover enabled for video-script jobs
- BGM enabled with platform default recommendation
- subtitles enabled
- original video audio disabled unless explicitly selected
- aspect ratio fixed to `9:16` for Douyin and Xiaohongshu short video tasks

The worker should validate this object before calling the engine. Unsupported
providers, invalid volume ranges, invalid BGM filters, or missing locked script
should fail as `failed_manual`, not as retryable engine errors.

## FireRed Mapping

The `fire_red` adapter should build a worker payload with:

- locked script text
- input asset local paths
- desired outputs
- production config
- service config for TTS provider credentials
- prompt constraints that require final `render_video`

Voiceover mapping:

- `productionConfig.voiceover.provider` maps to FireRed TTS provider.
- TTS credentials come from server environment or private deployment config,
  not from user input.
- voice style, speed, and volume map to FireRed voiceover parameters where the
  selected provider supports them.

BGM mapping:

- `productionConfig.bgm.userRequest` maps to `SelectBGMInput.user_request`.
- `include` and `exclude` map to `filter_include` and `filter_exclude`.
- `volume` maps to `RenderVideoInput.bgm_volume_scale`.

Render mapping:

- `render.aspectRatio` maps to `RenderVideoInput.aspect_ratio`.
- `render.includeOriginalAudio` maps to `RenderVideoInput.include_video_audio`.
- subtitles stay enabled unless explicitly disabled by platform config.

## Resource Requirements

FireRed production mode requires these runtime resources:

- FireRed models under the mounted `.storyline` directory
- `resource/bgms` with audio files and `meta.json`
- `resource/tts/tts_providers.json`
- provider credentials for LLM, VLM, and the selected TTS provider
- `ffmpeg` in both engine containers

Server setup must either:

- build with `DOWNLOAD_FIRERED_ASSETS=true`, or
- mount prepared host directories under
  `/srv/jingjing-video-worker/firered/{.storyline,resource,outputs}`.

Secrets must not be committed to git. Existing plaintext provider keys in
FireRed config files should be moved to environment variables and rotated.

## UI Changes

The first UI should expose only stable business choices:

- voiceover provider and simple voice style
- BGM request text and optional mood/scene/genre filters
- BGM volume
- subtitle enabled flag
- include original video audio flag
- max duration guidance

The existing free-text "supplementary execution instruction" remains available
for creative direction, but it should not be the only way to configure TTS or
BGM.

## Revision Support

Phase two should persist FireRed execution context in job metadata:

- FireRed `session_id`
- render metadata path
- production config used for the run
- selected BGM and generated voiceover artifact summaries

Regeneration should reuse this context when possible. A later revision API can
create a new job with `sourceJobId` and revision-specific production config,
while still preserving the original locked script unless the user approves a
new script variant.

## Failure Handling

Use explicit failure classes:

- `failed_manual`: invalid production config, missing approved script, invalid
  asset contract, unsupported provider, missing server resource detected before
  engine execution.
- `failed_retryable`: FireRed timeout, temporary provider failure, TTS provider
  outage, BGM file read failure, output upload failure.
- `cancelled`: user cancellation before or during worker execution.

The worker should record `current_stage` values that are useful to product and
operations:

- `production_config_validation`
- `downloading_inputs`
- `openstoryline_rendering`
- `voiceover_generation`
- `bgm_selection`
- `render_video`
- `uploading_outputs`

FireRed internal errors should be summarized into platform diagnostics without
leaking provider secrets.

## Testing Strategy

Unit tests:

- production config validation
- worker payload mapping into `openstoryline-engine`
- `fire_red` adapter payload mapping into FireRed `/api/worker/runs`
- failure classification for invalid config and missing resources

Integration smoke tests:

- skeleton adapter still generates placeholder outputs
- FireRed adapter rejects missing base URL and provider key
- FireRed adapter posts expected payload with production config

Server smoke test:

- run compose with `--profile firered`
- set `OPENSTORYLINE_ENGINE_ADAPTER=fire_red`
- provide prepared resources and provider credentials
- submit one locked-script job with one short local media asset
- verify final video exists, has non-empty audio, has expected duration, and
  worker uploads outputs to COS

## Rollout Plan

P0: FireRed runtime readiness

- prepare resource mounts or build-time downloads
- configure LLM, VLM, and TTS provider secrets through environment variables
- run private FireRed service and confirm `/health`
- run one direct `/api/worker/runs` smoke

P1: Worker contract and adapter

- add `productionConfig` to platform job payload
- validate config in worker
- map config through `openstoryline-engine`
- map config into FireRed worker payload
- add unit tests for mapping and validation

P2: Platform UI

- add structured controls for voiceover, BGM, subtitles, and original audio
- keep free-text instruction as supplemental direction
- show generated output metadata and engine diagnostics

P3: Revision workflow

- persist FireRed session metadata
- support regeneration from existing job context
- keep script-lock rules intact

P4: Production hardening

- add timeout and cost guardrails
- improve stage-level diagnostics
- rotate secrets out of committed config
- document server setup and rollback path

## Non-Goals

This design does not expose FireRed's Web/MCP interface directly to merchants.
It also does not make the worker responsible for growth strategy, account
selection, publish targeting, or content compliance decisions. Those remain in
the platform business layer.

## Acceptance Criteria

- A merchant-approved video script can create a `video_edit_jobs` row with
  structured production config.
- The worker can route the job through `OPENSTORYLINE_ENGINE_ADAPTER=fire_red`.
- The generated final video contains real audio when voiceover or BGM is
  enabled.
- The worker uploads final video, cover, subtitles, and metadata to COS.
- Job status and failure diagnostics are visible through existing platform APIs.
- Skeleton mode still works as a safe local smoke fallback.
- No provider keys or generated runtime assets are committed to git.
