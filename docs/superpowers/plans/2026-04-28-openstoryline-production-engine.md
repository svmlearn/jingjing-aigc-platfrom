# OpenStoryline Production Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current OpenStoryline skeleton execution path with a controlled FireRed OpenStoryline production path that supports structured voiceover, BGM, subtitles, and rendering through `video_edit_jobs`.

**Architecture:** Keep `video_edit_jobs` as the platform entry point. Extend the platform job payload with `productionConfig`, validate it in the worker, forward it through `openstoryline-engine /v1/runs`, and map it into FireRed `/api/worker/runs` as service config plus strict prompt constraints. Keep `skeleton` mode as the safe local fallback.

**Tech Stack:** Next.js 16, TypeScript, Zod, Python 3.11, FastAPI, Pydantic, Docker Compose, FireRed OpenStoryline, Tencent COS, Supabase.

---

## Scope

This plan covers the first releasable slice:

- P0 runtime readiness and secret cleanup
- P1 production contract, worker validation, and adapter mapping
- P2 platform UI controls for voiceover and BGM
- smoke documentation for running FireRed mode

Revision reuse (`session_id` continuation), cost dashboards, and deeper observability should be implemented in a follow-up plan after this slice produces real videos reliably.

## File Map

- `workers/video-worker/openstoryline/firered/config.toml`: remove committed concrete provider keys; keep environment placeholders.
- `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`: mirror safe provider placeholders.
- `workers/video-worker/.env.example`: add FireRed resource and TTS provider environment variables.
- `workers/video-worker/docker-compose.yml`: pass TTS provider environment variables into `openstoryline-engine` and `firered-openstoryline`.
- `workers/video-worker/README.md`: document FireRed production mode setup and smoke verification.
- `app/src/contracts/video.ts`: expose the `ProductionConfig` request type.
- `app/src/server/api/schemas.ts`: accept `productionConfig` on create job requests.
- `app/src/server/api/video-job-payload.ts`: normalize default and user-supplied production config into `input_payload`.
- `app/src/server/api/video-job-payload.test.ts`: verify defaults, overrides, and invalid config rejection.
- `app/src/server/api/video-edit-jobs-service.ts`: pass request production config into payload assembly.
- `app/src/components/dashboard/draft-video-panels.tsx`: add structured controls to the draft video panel.
- `app/src/components/merchant/video-workbench.tsx`: pass the same structured config from the video workbench.
- `app/src/lib/ui/video-workflow.ts`: extend the client helper payload.
- `workers/video-worker/worker/app/directive.py`: parse and validate `productionConfig`.
- `workers/video-worker/tests/test_directive_contract.py`: cover worker-side validation.
- `workers/video-worker/worker/app/openstoryline_client.py`: forward `production_config` to `openstoryline-engine`.
- `workers/video-worker/tests/test_openstoryline_contract_payload.py`: verify transport payload.
- `workers/video-worker/openstoryline/app/schemas.py`: accept `production_config` on `/v1/runs`.
- `workers/video-worker/openstoryline/app/config.py`: read FireRed TTS provider settings.
- `workers/video-worker/openstoryline/app/engine_adapters.py`: map production config into FireRed worker payload.
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`: verify FireRed payload mapping and service config.

---

### Task 0: Create An Isolated Worktree

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Check the current worktree**

Run:

```powershell
git status --short --branch
```

Expected: existing unrelated untracked docs may remain visible. Do not add them to this task.

- [ ] **Step 2: Create a dedicated worktree**

Run from `D:\codexplan\work\jingjing-content-platform`:

```powershell
git worktree add ..\jingjing-content-platform-openstoryline-prod -b codex/openstoryline-production-engine
```

Expected: a clean worktree is created at `D:\codexplan\work\jingjing-content-platform-openstoryline-prod`.

- [ ] **Step 3: Re-read project context in the worktree**

Run:

```powershell
Get-Content -Encoding UTF8 -LiteralPath AGENTS.md
Get-Content -Encoding UTF8 -LiteralPath docs\README.md
Get-Content -Encoding UTF8 -LiteralPath docs\superpowers\specs\2026-04-28-openstoryline-production-engine-design.md
```

Expected: the implementation starts from the approved design, not from chat memory.

---

### Task 1: Clean FireRed Runtime Config And Add Provider Env Surface

**Files:**
- Modify: `workers/video-worker/openstoryline/firered/config.toml`
- Modify: `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- Modify: `workers/video-worker/.env.example`
- Modify: `workers/video-worker/docker-compose.yml`
- Modify: `workers/video-worker/README.md`

- [ ] **Step 1: Run the current secret scan**

Run:

```powershell
Select-String -Encoding UTF8 -Path `
  'workers\video-worker\openstoryline\firered\config.toml',`
  'workers\video-worker\openstoryline\firered\config.video_edit_engine.toml' `
  -Pattern 'api_key = "sk-|api_key = "[a-zA-Z0-9]{20,}|access_key = "[a-zA-Z0-9]{20,}'
```

Expected now: matches may appear. Expected after this task: no matches.

- [ ] **Step 2: Replace concrete model keys with environment placeholders**

In both FireRed config files, make the LLM and VLM blocks use this pattern:

```toml
[llm]
model = "${OPENSTORYLINE_LLM_MODEL:-glm-4.6v}"
base_url = "${OPENSTORYLINE_LLM_BASE_URL:-https://open.bigmodel.cn/api/paas/v4/}"
api_key = "${OPENSTORYLINE_LLM_API_KEY:-}"
timeout = 30.0
temperature = 0.1
max_retries = 2

[vlm]
model = "${OPENSTORYLINE_VLM_MODEL:-glm-4.6v}"
base_url = "${OPENSTORYLINE_VLM_BASE_URL:-https://open.bigmodel.cn/api/paas/v4/}"
api_key = "${OPENSTORYLINE_VLM_API_KEY:-}"
timeout = 60.0
temperature = 0.1
max_retries = 2
```

For AI transition providers, keep provider names but remove concrete keys:

```toml
[generate_ai_transition.providers.dashscope]
model_name = "wan2.2-kf2v-flash"
api_key = "${AI_TRANSITION_DASHSCOPE_API_KEY:-}"

[generate_ai_transition.providers.minimax]
model_name = "MiniMax-Hailuo-02"
api_key = "${AI_TRANSITION_MINIMAX_API_KEY:-}"
```

- [ ] **Step 3: Add explicit TTS env fields**

Append these fields to `workers/video-worker/.env.example` under OpenStoryline provider config:

```dotenv
# FireRed TTS provider selected by platform productionConfig.
OPENSTORYLINE_TTS_PROVIDER=bytedance_bigtts
TTS_302_BASE_URL=https://api.302.ai
TTS_302_API_KEY=
TTS_MINIMAX_BASE_URL=https://api.minimax.io
TTS_MINIMAX_API_KEY=
TTS_BYTEDANCE_BIGTTS_BASE_URL=https://openspeech.bytedance.com
TTS_BYTEDANCE_BIGTTS_UID=openstoryline
TTS_BYTEDANCE_BIGTTS_APPID=
TTS_BYTEDANCE_BIGTTS_ACCESS_KEY=
TTS_BYTEDANCE_BIGTTS_RESOURCE_ID=
TTS_BYTEDANCE_BIGTTS_SPEAKER=
AI_TRANSITION_DASHSCOPE_API_KEY=
AI_TRANSITION_MINIMAX_API_KEY=
```

- [ ] **Step 4: Pass the same environment into both engine services**

In `workers/video-worker/docker-compose.yml`, add these keys to both `openstoryline-engine.environment` and `firered-openstoryline.environment`:

```yaml
      OPENSTORYLINE_TTS_PROVIDER: ${OPENSTORYLINE_TTS_PROVIDER:-bytedance_bigtts}
      TTS_302_BASE_URL: ${TTS_302_BASE_URL:-https://api.302.ai}
      TTS_302_API_KEY: ${TTS_302_API_KEY:-}
      TTS_MINIMAX_BASE_URL: ${TTS_MINIMAX_BASE_URL:-https://api.minimax.io}
      TTS_MINIMAX_API_KEY: ${TTS_MINIMAX_API_KEY:-}
      TTS_BYTEDANCE_BIGTTS_BASE_URL: ${TTS_BYTEDANCE_BIGTTS_BASE_URL:-https://openspeech.bytedance.com}
      TTS_BYTEDANCE_BIGTTS_UID: ${TTS_BYTEDANCE_BIGTTS_UID:-openstoryline}
      TTS_BYTEDANCE_BIGTTS_APPID: ${TTS_BYTEDANCE_BIGTTS_APPID:-}
      TTS_BYTEDANCE_BIGTTS_ACCESS_KEY: ${TTS_BYTEDANCE_BIGTTS_ACCESS_KEY:-}
      TTS_BYTEDANCE_BIGTTS_RESOURCE_ID: ${TTS_BYTEDANCE_BIGTTS_RESOURCE_ID:-}
      TTS_BYTEDANCE_BIGTTS_SPEAKER: ${TTS_BYTEDANCE_BIGTTS_SPEAKER:-}
      AI_TRANSITION_DASHSCOPE_API_KEY: ${AI_TRANSITION_DASHSCOPE_API_KEY:-}
      AI_TRANSITION_MINIMAX_API_KEY: ${AI_TRANSITION_MINIMAX_API_KEY:-}
```

- [ ] **Step 5: Document the resource requirement**

In `workers/video-worker/README.md`, add this section after the FireRed routing example:

```markdown
### FireRed production assets

FireRed mode requires runtime assets that are not committed to git:

- `/srv/jingjing-video-worker/firered/.storyline`
- `/srv/jingjing-video-worker/firered/resource/bgms`
- `/srv/jingjing-video-worker/firered/resource/tts/tts_providers.json`
- `/srv/jingjing-video-worker/firered/outputs`

Use one of two setup paths:

1. Build with `DOWNLOAD_FIRERED_ASSETS=true`.
2. Prepare the host directories before starting compose and keep
   `DOWNLOAD_FIRERED_ASSETS=false`.

Provider secrets must stay in `.env` or the deployment secret manager. Do not
write concrete provider keys into FireRed config files.
```

- [ ] **Step 6: Verify the secret scan is clean**

Run:

```powershell
Select-String -Encoding UTF8 -Path `
  'workers\video-worker\openstoryline\firered\config.toml',`
  'workers\video-worker\openstoryline\firered\config.video_edit_engine.toml' `
  -Pattern 'api_key = "sk-|api_key = "[a-zA-Z0-9]{20,}|access_key = "[a-zA-Z0-9]{20,}'
```

Expected: no output.

- [ ] **Step 7: Commit**

```powershell
git add workers\video-worker\openstoryline\firered\config.toml `
  workers\video-worker\openstoryline\firered\config.video_edit_engine.toml `
  workers\video-worker\.env.example `
  workers\video-worker\docker-compose.yml `
  workers\video-worker\README.md
git commit -m "chore: configure firered production providers"
```

---

### Task 2: Add Platform `productionConfig` Contract

**Files:**
- Modify: `app/src/contracts/video.ts`
- Modify: `app/src/server/api/schemas.ts`
- Modify: `app/src/server/api/video-job-payload.ts`
- Modify: `app/src/server/api/video-job-payload.test.ts`
- Modify: `app/src/server/api/video-edit-jobs-service.ts`

- [ ] **Step 1: Add failing payload tests**

Append these tests to `app/src/server/api/video-job-payload.test.ts`:

```ts
test("buildVideoEditJobInputPayload adds default production config", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    now: "2026-04-27T00:00:00.000Z",
  });

  assert.deepEqual(payload.productionConfig, {
    voiceover: {
      enabled: true,
      provider: "bytedance_bigtts",
      volume: 2,
    },
    bgm: {
      enabled: true,
      userRequest: "",
      include: {},
      exclude: {},
      volume: 0.25,
    },
    subtitles: {
      enabled: true,
      style: "platform_default",
    },
    render: {
      aspectRatio: "9:16",
      includeOriginalAudio: false,
    },
  });
});

test("buildVideoEditJobInputPayload normalizes production config overrides", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    productionConfig: {
      voiceover: {
        enabled: true,
        provider: "minimax",
        voiceStyle: "warm female",
        speed: 1.1,
        volume: 1.8,
      },
      bgm: {
        enabled: true,
        userRequest: "轻快但不要吵",
        include: { mood: ["Happy"], scene: ["Vlog"], genre: ["Pop"], lang: ["bgm"] },
        exclude: { mood: ["Sorrow"] },
        volume: 0.35,
      },
      subtitles: { enabled: true, style: "bold_caption" },
      render: { aspectRatio: "9:16", maxDurationSeconds: 90, includeOriginalAudio: true },
    },
  });

  assert.equal(payload.productionConfig.voiceover.provider, "minimax");
  assert.equal(payload.productionConfig.voiceover.voiceStyle, "warm female");
  assert.equal(payload.productionConfig.bgm.userRequest, "轻快但不要吵");
  assert.deepEqual(payload.productionConfig.bgm.include.mood, ["Happy"]);
  assert.equal(payload.productionConfig.render.maxDurationSeconds, 90);
  assert.equal(payload.productionConfig.render.includeOriginalAudio, true);
});

test("buildVideoEditJobInputPayload rejects unsupported voiceover provider", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [],
        assets: [],
        productionConfig: {
          voiceover: { enabled: true, provider: "azure" },
        },
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_PRODUCTION_CONFIG_INVALID",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
```

Expected: failures mention missing `productionConfig` support.

- [ ] **Step 3: Add shared request types**

In `app/src/contracts/video.ts`, add:

```ts
export type VoiceoverProvider = "bytedance_bigtts" | "minimax" | "302";

export type ProductionConfig = {
  voiceover?: {
    enabled?: boolean;
    provider?: VoiceoverProvider;
    voiceStyle?: string | null;
    speed?: number | null;
    volume?: number | null;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: Record<string, Array<string | number>>;
    exclude?: Record<string, Array<string | number>>;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
  };
};
```

Then extend `CreateVideoEditJobRequest`:

```ts
export type CreateVideoEditJobRequest = {
  contentVariantId: string;
  instructionText?: string | null;
  inputPayload?: Record<string, unknown>;
  sourceJobId?: string | null;
  productionConfig?: ProductionConfig | null;
};
```

- [ ] **Step 4: Accept `productionConfig` in API schema**

In `app/src/server/api/schemas.ts`, define:

```ts
const voiceoverProviderSchema = z.enum(["bytedance_bigtts", "minimax", "302"]);
const bgmFilterSchema = z.record(z.string(), z.array(z.union([z.string(), z.number()])));

const productionConfigSchema = z.object({
  voiceover: z
    .object({
      enabled: z.boolean().optional(),
      provider: voiceoverProviderSchema.optional(),
      voiceStyle: z.string().trim().max(120).nullish(),
      speed: z.number().min(0.5).max(2).nullish(),
      volume: z.number().min(0).max(3).nullish(),
    })
    .optional(),
  bgm: z
    .object({
      enabled: z.boolean().optional(),
      userRequest: z.string().trim().max(500).nullish(),
      include: bgmFilterSchema.optional(),
      exclude: bgmFilterSchema.optional(),
      volume: z.number().min(0).max(3).nullish(),
    })
    .optional(),
  subtitles: z
    .object({
      enabled: z.boolean().optional(),
      style: z.enum(["platform_default", "bold_caption"]).optional(),
    })
    .optional(),
  render: z
    .object({
      aspectRatio: z.literal("9:16").optional(),
      maxDurationSeconds: z.number().int().min(15).max(180).nullish(),
      includeOriginalAudio: z.boolean().optional(),
    })
    .optional(),
});
```

Then add it to `createVideoEditJobSchema`:

```ts
productionConfig: productionConfigSchema.nullish(),
```

- [ ] **Step 5: Normalize production config in payload builder**

In `app/src/server/api/video-job-payload.ts`, add a type and helper:

```ts
type ProductionConfigInput = {
  voiceover?: {
    enabled?: boolean;
    provider?: string;
    voiceStyle?: string | null;
    speed?: number | null;
    volume?: number | null;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: Record<string, Array<string | number>>;
    exclude?: Record<string, Array<string | number>>;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
  };
};

const voiceoverProviders = new Set(["bytedance_bigtts", "minimax", "302"]);

function normalizeProductionConfig(input?: ProductionConfigInput | null) {
  const provider = input?.voiceover?.provider ?? "bytedance_bigtts";
  if (!voiceoverProviders.has(provider)) {
    throw new VideoJobPayloadValidationError(
      400,
      "VIDEO_PRODUCTION_CONFIG_INVALID",
      "Unsupported voiceover provider.",
    );
  }

  return {
    voiceover: {
      enabled: input?.voiceover?.enabled ?? true,
      provider: provider as "bytedance_bigtts" | "minimax" | "302",
      ...(input?.voiceover?.voiceStyle ? { voiceStyle: input.voiceover.voiceStyle.trim() } : {}),
      ...(typeof input?.voiceover?.speed === "number" ? { speed: input.voiceover.speed } : {}),
      volume: input?.voiceover?.volume ?? 2,
    },
    bgm: {
      enabled: input?.bgm?.enabled ?? true,
      userRequest: input?.bgm?.userRequest?.trim() ?? "",
      include: input?.bgm?.include ?? {},
      exclude: input?.bgm?.exclude ?? {},
      volume: input?.bgm?.volume ?? 0.25,
    },
    subtitles: {
      enabled: input?.subtitles?.enabled ?? true,
      style: input?.subtitles?.style ?? "platform_default",
    },
    render: {
      aspectRatio: "9:16" as const,
      ...(typeof input?.render?.maxDurationSeconds === "number"
        ? { maxDurationSeconds: input.render.maxDurationSeconds }
        : {}),
      includeOriginalAudio: input?.render?.includeOriginalAudio ?? false,
    },
  };
}
```

Extend `VideoEditJobInputPayload` with:

```ts
productionConfig: ReturnType<typeof normalizeProductionConfig>;
```

Extend `buildVideoEditJobInputPayload` input with:

```ts
productionConfig?: ProductionConfigInput | null;
```

Set the returned field:

```ts
productionConfig: normalizeProductionConfig(input.productionConfig),
```

- [ ] **Step 6: Pass request config through the service**

In `app/src/server/api/video-edit-jobs-service.ts`, pass `productionConfig` into `buildServerManagedInputPayload`:

```ts
const inputPayload = await buildServerManagedInputPayload({
  merchantId: variant.merchantId,
  draftId: variant.draftId,
  variant,
  productionConfig: input.request.productionConfig ?? null,
});
```

Extend the helper input and builder calls:

```ts
async function buildServerManagedInputPayload(input: {
  merchantId: string;
  draftId: string;
  variant: VideoJobPayloadVariant;
  productionConfig?: Parameters<typeof buildVideoEditJobInputPayload>[0]["productionConfig"];
}) {
  ...
  return buildVideoEditJobPayloadOrThrow({
    draftId: input.draftId,
    variant: input.variant,
    materialReferences: [],
    assets: [],
    productionConfig: input.productionConfig,
  });
}
```

Apply the same `productionConfig` property to the Supabase-configured branch.

- [ ] **Step 7: Run app contract checks**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
pnpm typecheck
```

Expected: tests pass and TypeScript passes.

- [ ] **Step 8: Commit**

```powershell
git add app\src\contracts\video.ts `
  app\src\server\api\schemas.ts `
  app\src\server\api\video-job-payload.ts `
  app\src\server\api\video-job-payload.test.ts `
  app\src\server\api\video-edit-jobs-service.ts
git commit -m "feat: add video production config contract"
```

---

### Task 3: Validate Production Config In The Worker

**Files:**
- Modify: `workers/video-worker/worker/app/directive.py`
- Modify: `workers/video-worker/tests/test_directive_contract.py`

- [ ] **Step 1: Add failing worker validation tests**

Append to `workers/video-worker/tests/test_directive_contract.py`:

```python
    def test_directive_normalizes_production_config(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {"text": "fixed script", "locked": True},
                "productionDirective": {"desiredOutputs": ["final_video"]},
                "productionConfig": {
                    "voiceover": {
                        "enabled": True,
                        "provider": "minimax",
                        "voiceStyle": "warm female",
                        "speed": 1.1,
                        "volume": 1.8,
                    },
                    "bgm": {
                        "enabled": True,
                        "userRequest": "轻快但不要吵",
                        "include": {"mood": ["Happy"]},
                        "exclude": {"mood": ["Sorrow"]},
                        "volume": 0.35,
                    },
                    "subtitles": {"enabled": True, "style": "bold_caption"},
                    "render": {"aspectRatio": "9:16", "maxDurationSeconds": 90, "includeOriginalAudio": True},
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual("minimax", directive.production_config["voiceover"]["provider"])
        self.assertEqual("轻快但不要吵", directive.production_config["bgm"]["user_request"])
        self.assertEqual(["Happy"], directive.production_config["bgm"]["include"]["mood"])
        self.assertEqual(90, directive.production_config["render"]["max_duration_seconds"])

    def test_directive_rejects_invalid_production_config_provider(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {"text": "fixed script", "locked": True},
                "productionDirective": {"desiredOutputs": ["final_video"]},
                "productionConfig": {"voiceover": {"enabled": True, "provider": "azure"}},
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("invalid_production_config", exc.exception.failure_code)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_directive_contract.py -v
```

Expected: failures mention missing `production_config`.

- [ ] **Step 3: Add production config to the directive dataclass**

In `workers/video-worker/worker/app/directive.py`, add:

```python
ALLOWED_VOICEOVER_PROVIDERS = frozenset({"bytedance_bigtts", "minimax", "302"})
ALLOWED_SUBTITLE_STYLES = frozenset({"platform_default", "bold_caption"})
ALLOWED_BGM_FILTER_KEYS = frozenset({"mood", "scene", "genre", "lang", "id"})
```

Extend `ProductionDirective`:

```python
    production_config: dict[str, Any]
```

Extend `to_payload`:

```python
            "production_config": self.production_config,
```

- [ ] **Step 4: Add normalization helpers**

Add these helpers below `_tuple_value`:

```python
def _production_config(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _dict_value(payload, "productionConfig", "production_config")
    voiceover = _dict_value(raw, "voiceover")
    bgm = _dict_value(raw, "bgm")
    subtitles = _dict_value(raw, "subtitles")
    render = _dict_value(raw, "render")

    provider = _string_value(voiceover, "provider") or "bytedance_bigtts"
    if provider not in ALLOWED_VOICEOVER_PROVIDERS:
        raise DirectiveValidationError(
            "productionConfig.voiceover.provider is unsupported",
            failure_code="invalid_production_config",
        )

    subtitle_style = _string_value(subtitles, "style") or "platform_default"
    if subtitle_style not in ALLOWED_SUBTITLE_STYLES:
        raise DirectiveValidationError(
            "productionConfig.subtitles.style is unsupported",
            failure_code="invalid_production_config",
        )

    return {
        "voiceover": {
            "enabled": _bool_value(voiceover, "enabled", default=True),
            "provider": provider,
            **_optional_string(voiceover, "voiceStyle", "voice_style"),
            **_optional_number(voiceover, "speed", min_value=0.5, max_value=2.0),
            "volume": _number_value(voiceover, "volume", default=2.0, min_value=0.0, max_value=3.0),
        },
        "bgm": {
            "enabled": _bool_value(bgm, "enabled", default=True),
            "user_request": _string_value(bgm, "userRequest", "user_request"),
            "include": _filter_dict(bgm.get("include")),
            "exclude": _filter_dict(bgm.get("exclude")),
            "volume": _number_value(bgm, "volume", default=0.25, min_value=0.0, max_value=3.0),
        },
        "subtitles": {
            "enabled": _bool_value(subtitles, "enabled", default=True),
            "style": subtitle_style,
        },
        "render": {
            "aspect_ratio": "9:16",
            **_optional_int(render, "maxDurationSeconds", "max_duration_seconds", min_value=15, max_value=180),
            "include_original_audio": _bool_value(render, "includeOriginalAudio", "include_original_audio", default=False),
        },
    }


def _number_value(payload: dict[str, Any], key: str, *, default: float, min_value: float, max_value: float) -> float:
    value = payload.get(key)
    if value is None:
        return default
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise DirectiveValidationError(f"{key} must be a number", failure_code="invalid_production_config")
    number = float(value)
    if number < min_value or number > max_value:
        raise DirectiveValidationError(f"{key} is out of range", failure_code="invalid_production_config")
    return number


def _optional_number(payload: dict[str, Any], key: str, *, min_value: float, max_value: float) -> dict[str, float]:
    if key not in payload or payload.get(key) is None:
        return {}
    return {key: _number_value(payload, key, default=0, min_value=min_value, max_value=max_value)}


def _optional_int(payload: dict[str, Any], *keys: str, min_value: int, max_value: int) -> dict[str, int]:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise DirectiveValidationError(f"{key} must be an integer", failure_code="invalid_production_config")
        if value < min_value or value > max_value:
            raise DirectiveValidationError(f"{key} is out of range", failure_code="invalid_production_config")
        return {"max_duration_seconds": value}
    return {}


def _optional_string(payload: dict[str, Any], *keys: str) -> dict[str, str]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return {"voice_style": value.strip()}
    return {}


def _filter_dict(value: Any) -> dict[str, list[str | int]]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise DirectiveValidationError("BGM filters must be objects", failure_code="invalid_production_config")
    result: dict[str, list[str | int]] = {}
    for key, items in value.items():
        clean_key = str(key).strip()
        if clean_key not in ALLOWED_BGM_FILTER_KEYS:
            raise DirectiveValidationError("BGM filter key is unsupported", failure_code="invalid_production_config")
        if not isinstance(items, list):
            raise DirectiveValidationError("BGM filter values must be lists", failure_code="invalid_production_config")
        cleaned = [item for item in items if isinstance(item, str | int) and str(item).strip()]
        if cleaned:
            result[clean_key] = cleaned
    return result
```

- [ ] **Step 5: Set `production_config` in `build_production_directive`**

Add this to the returned `ProductionDirective`:

```python
        production_config=_production_config(payload),
```

- [ ] **Step 6: Run worker directive tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_directive_contract.py -v
```

Expected: directive tests pass.

- [ ] **Step 7: Commit**

```powershell
git add workers\video-worker\worker\app\directive.py workers\video-worker\tests\test_directive_contract.py
git commit -m "feat: validate video production config in worker"
```

---

### Task 4: Forward Production Config Through The Engine Contract

**Files:**
- Modify: `workers/video-worker/openstoryline/app/schemas.py`
- Modify: `workers/video-worker/worker/app/openstoryline_client.py`
- Modify: `workers/video-worker/tests/test_openstoryline_contract_payload.py`
- Modify: `workers/video-worker/tests/test_engine_run_contract.py`

- [ ] **Step 1: Add failing transport assertion**

In `workers/video-worker/tests/test_openstoryline_contract_payload.py`, extend `make_job().input_payload` with:

```python
            "productionConfig": {
                "voiceover": {"enabled": True, "provider": "minimax", "volume": 1.8},
                "bgm": {"enabled": True, "userRequest": "轻快", "volume": 0.35},
                "subtitles": {"enabled": True, "style": "bold_caption"},
                "render": {"aspectRatio": "9:16", "includeOriginalAudio": True},
            },
```

Add assertions:

```python
        self.assertEqual("minimax", captured_payload["production_config"]["voiceover"]["provider"])
        self.assertEqual("轻快", captured_payload["production_config"]["bgm"]["user_request"])
        self.assertEqual(0.35, captured_payload["production_config"]["bgm"]["volume"])
        self.assertTrue(captured_payload["production_config"]["render"]["include_original_audio"])
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_contract_payload.py -v
```

Expected: `production_config` key is missing.

- [ ] **Step 3: Add the schema field**

In `workers/video-worker/openstoryline/app/schemas.py`, add to `RunRequest`:

```python
    production_config: dict[str, Any] = Field(default_factory=dict)
```

- [ ] **Step 4: Send the field from the worker client**

In `workers/video-worker/worker/app/openstoryline_client.py`, add this key to the payload:

```python
            "production_config": directive.production_config,
```

- [ ] **Step 5: Add engine schema contract coverage**

In `workers/video-worker/tests/test_engine_run_contract.py`, add:

```python
    def test_run_request_keeps_production_config(self):
        request = RunRequest(
            job_id="job_1",
            merchant_id="merchant_1",
            draft_id="draft_1",
            content_variant_id="variant_1",
            workspace_dir="/tmp/workspace",
            output_dir="/tmp/output",
            production_config={
                "voiceover": {"enabled": True, "provider": "minimax"},
                "bgm": {"enabled": True, "user_request": "轻快"},
            },
        )

        self.assertEqual("minimax", request.production_config["voiceover"]["provider"])
        self.assertEqual("轻快", request.production_config["bgm"]["user_request"])
```

- [ ] **Step 6: Run transport and engine schema tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_contract_payload.py workers\video-worker\tests\test_engine_run_contract.py -v
```

Expected: tests pass.

- [ ] **Step 7: Commit**

```powershell
git add workers\video-worker\openstoryline\app\schemas.py `
  workers\video-worker\worker\app\openstoryline_client.py `
  workers\video-worker\tests\test_openstoryline_contract_payload.py `
  workers\video-worker\tests\test_engine_run_contract.py
git commit -m "feat: forward production config to openstoryline engine"
```

---

### Task 5: Map Production Config Into FireRed Worker Runs

**Files:**
- Modify: `workers/video-worker/openstoryline/app/config.py`
- Modify: `workers/video-worker/openstoryline/app/engine_adapters.py`
- Modify: `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

- [ ] **Step 1: Add failing adapter mapping assertions**

In `test_fire_red_adapter_posts_worker_run_payload_and_returns_outputs`, set `production_config` on `RunRequest`:

```python
                    production_config={
                        "voiceover": {
                            "enabled": True,
                            "provider": "minimax",
                            "voice_style": "warm female",
                            "speed": 1.1,
                            "volume": 1.8,
                        },
                        "bgm": {
                            "enabled": True,
                            "user_request": "轻快但不要吵",
                            "include": {"mood": ["Happy"]},
                            "exclude": {"mood": ["Sorrow"]},
                            "volume": 0.35,
                        },
                        "subtitles": {"enabled": True, "style": "bold_caption"},
                        "render": {"aspect_ratio": "9:16", "include_original_audio": True},
                    },
```

Add assertions after `payload = kwargs["json"]`:

```python
            self.assertEqual("minimax", payload["production_config"]["voiceover"]["provider"])
            self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
            self.assertEqual("test-minimax-key", payload["service_config"]["tts"]["minimax"]["api_key"])
            self.assertIn("generate_voiceover", payload["prompt"])
            self.assertIn("select_bgm", payload["prompt"])
            self.assertIn("render_video", payload["prompt"])
            self.assertIn("轻快但不要吵", payload["prompt"])
```

Construct `Settings` with minimax fields:

```python
            tts_minimax_api_key="test-minimax-key",
            tts_minimax_base_url="https://api.minimax.io",
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_engine_adapters.py -v
```

Expected: `service_config` is missing or `Settings` lacks the new fields.

- [ ] **Step 3: Add TTS settings**

In `workers/video-worker/openstoryline/app/config.py`, extend `Settings`:

```python
    tts_provider: str = "bytedance_bigtts"
    tts_302_base_url: str = ""
    tts_302_api_key: str = ""
    tts_minimax_base_url: str = ""
    tts_minimax_api_key: str = ""
    tts_bytedance_bigtts_base_url: str = ""
    tts_bytedance_bigtts_uid: str = ""
    tts_bytedance_bigtts_appid: str = ""
    tts_bytedance_bigtts_access_key: str = ""
    tts_bytedance_bigtts_resource_id: str = ""
    tts_bytedance_bigtts_speaker: str = ""
```

Read them in `from_env`:

```python
            tts_provider=os.getenv("OPENSTORYLINE_TTS_PROVIDER", "bytedance_bigtts").strip().lower() or "bytedance_bigtts",
            tts_302_base_url=os.getenv("TTS_302_BASE_URL", "https://api.302.ai").strip(),
            tts_302_api_key=os.getenv("TTS_302_API_KEY", "").strip(),
            tts_minimax_base_url=os.getenv("TTS_MINIMAX_BASE_URL", "https://api.minimax.io").strip(),
            tts_minimax_api_key=os.getenv("TTS_MINIMAX_API_KEY", "").strip(),
            tts_bytedance_bigtts_base_url=os.getenv("TTS_BYTEDANCE_BIGTTS_BASE_URL", "https://openspeech.bytedance.com").strip(),
            tts_bytedance_bigtts_uid=os.getenv("TTS_BYTEDANCE_BIGTTS_UID", "openstoryline").strip(),
            tts_bytedance_bigtts_appid=os.getenv("TTS_BYTEDANCE_BIGTTS_APPID", "").strip(),
            tts_bytedance_bigtts_access_key=os.getenv("TTS_BYTEDANCE_BIGTTS_ACCESS_KEY", "").strip(),
            tts_bytedance_bigtts_resource_id=os.getenv("TTS_BYTEDANCE_BIGTTS_RESOURCE_ID", "").strip(),
            tts_bytedance_bigtts_speaker=os.getenv("TTS_BYTEDANCE_BIGTTS_SPEAKER", "").strip(),
```

- [ ] **Step 4: Build FireRed service config**

In `workers/video-worker/openstoryline/app/engine_adapters.py`, add:

```python
def _build_fire_red_service_config(settings: Settings, production_config: dict[str, object]) -> dict[str, object]:
    voiceover = production_config.get("voiceover") if isinstance(production_config, dict) else {}
    if not isinstance(voiceover, dict) or voiceover.get("enabled") is False:
        return {}

    provider = str(voiceover.get("provider") or settings.tts_provider or "bytedance_bigtts").strip().lower()
    if provider == "302":
        provider = "302"

    if provider == "minimax":
        return {
            "tts": {
                "provider": "minimax",
                "minimax": {
                    "base_url": settings.tts_minimax_base_url or "https://api.minimax.io",
                    "api_key": settings.tts_minimax_api_key,
                },
            }
        }

    if provider == "302":
        return {
            "tts": {
                "provider": "302",
                "302": {
                    "base_url": settings.tts_302_base_url or "https://api.302.ai",
                    "api_key": settings.tts_302_api_key,
                },
            }
        }

    return {
        "tts": {
            "provider": "bytedance_bigtts",
            "bytedance_bigtts": {
                "base_url": settings.tts_bytedance_bigtts_base_url or "https://openspeech.bytedance.com",
                "uid": settings.tts_bytedance_bigtts_uid or "openstoryline",
                "appid": settings.tts_bytedance_bigtts_appid,
                "access_key": settings.tts_bytedance_bigtts_access_key,
                "resource_id": settings.tts_bytedance_bigtts_resource_id,
                "speaker": settings.tts_bytedance_bigtts_speaker,
            },
        }
    }
```

- [ ] **Step 5: Include config in the FireRed payload**

Update `_build_fire_red_run_payload`:

```python
def _build_fire_red_run_payload(request: RunRequest, settings: Settings) -> dict[str, object]:
    directive = request.production_directive or {}
    production_config = request.production_config or directive.get("production_config") or {}
    desired_outputs = list(directive.get("desired_outputs") or ["final_video"])
    payload = {
        ...
        "production_config": production_config,
        "service_config": _build_fire_red_service_config(settings, production_config),
        "prompt": _build_fire_red_prompt(request, desired_outputs, production_config),
    }
    return payload
```

Update the call site:

```python
payload = _build_fire_red_run_payload(request, self._settings)
```

- [ ] **Step 6: Strengthen the FireRed prompt**

Change `_build_fire_red_prompt` signature:

```python
def _build_fire_red_prompt(
    request: RunRequest,
    desired_outputs: list[str],
    production_config: dict[str, object],
) -> str:
```

Add config JSON and explicit node instructions:

```python
    production_config_json = json.dumps(production_config or {}, ensure_ascii=False, indent=2)
```

Include these lines in the returned prompt:

```python
            "Required production nodes:",
            "- Use generate_voiceover when productionConfig.voiceover.enabled is true.",
            "- Use select_bgm when productionConfig.bgm.enabled is true.",
            "- Use render_video as the final node and include BGM/TTS tracks according to productionConfig.",
            "",
            "ProductionConfig:",
            production_config_json,
```

- [ ] **Step 7: Run adapter tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_engine_adapters.py -v
```

Expected: adapter tests pass.

- [ ] **Step 8: Commit**

```powershell
git add workers\video-worker\openstoryline\app\config.py `
  workers\video-worker\openstoryline\app\engine_adapters.py `
  workers\video-worker\tests\test_openstoryline_engine_adapters.py
git commit -m "feat: map production config to firered runs"
```

---

### Task 6: Add Structured Video Production Controls In The App

**Files:**
- Modify: `app/src/components/dashboard/draft-video-panels.tsx`
- Modify: `app/src/components/merchant/video-workbench.tsx`
- Modify: `app/src/lib/ui/video-workflow.ts`

- [ ] **Step 1: Add client payload support**

In `app/src/lib/ui/video-workflow.ts`, add:

```ts
type ProductionConfigPayload = {
  voiceover?: {
    enabled?: boolean;
    provider?: "bytedance_bigtts" | "minimax" | "302";
    voiceStyle?: string | null;
    speed?: number | null;
    volume?: number | null;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: Record<string, Array<string | number>>;
    exclude?: Record<string, Array<string | number>>;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
  };
};
```

Extend `createVideoEditJob` params:

```ts
  productionConfig?: ProductionConfigPayload | null;
```

Add both camel and snake keys to `requestPayload`:

```ts
    productionConfig: payload.productionConfig ?? null,
    production_config: payload.productionConfig ?? null,
```

- [ ] **Step 2: Add draft panel state**

In `app/src/components/dashboard/draft-video-panels.tsx`, add state near `instructionText`:

```tsx
const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
const [voiceoverProvider, setVoiceoverProvider] = useState<"bytedance_bigtts" | "minimax" | "302">("bytedance_bigtts");
const [bgmEnabled, setBgmEnabled] = useState(true);
const [bgmRequest, setBgmRequest] = useState("");
const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);
```

Add a helper before `handleCreateJob`:

```tsx
function buildProductionConfig() {
  return {
    voiceover: {
      enabled: voiceoverEnabled,
      provider: voiceoverProvider,
      volume: 2,
    },
    bgm: {
      enabled: bgmEnabled,
      userRequest: bgmRequest.trim(),
      include: {},
      exclude: {},
      volume: 0.25,
    },
    subtitles: {
      enabled: true,
      style: "platform_default" as const,
    },
    render: {
      aspectRatio: "9:16" as const,
      includeOriginalAudio,
    },
  };
}
```

Pass it in `handleCreateJob`:

```tsx
        productionConfig: buildProductionConfig(),
```

- [ ] **Step 3: Add compact controls without landing-page styling**

Place this block above the existing supplementary instruction textarea:

```tsx
<div className="mt-5 grid gap-3 rounded-md border border-[#dde3ea] bg-white p-4">
  <div className="grid gap-2 sm:grid-cols-2">
    <label className="flex items-center gap-2 text-sm text-[#334155]">
      <input
        type="checkbox"
        checked={voiceoverEnabled}
        onChange={(event) => setVoiceoverEnabled(event.target.checked)}
      />
      生成配音
    </label>
    <select
      value={voiceoverProvider}
      onChange={(event) => setVoiceoverProvider(event.target.value as "bytedance_bigtts" | "minimax" | "302")}
      className="h-9 rounded-md border border-[#cbd5e1] bg-white px-2 text-sm"
      disabled={!voiceoverEnabled}
    >
      <option value="bytedance_bigtts">火山 BigTTS</option>
      <option value="minimax">MiniMax</option>
      <option value="302">302</option>
    </select>
  </div>
  <label className="flex items-center gap-2 text-sm text-[#334155]">
    <input
      type="checkbox"
      checked={bgmEnabled}
      onChange={(event) => setBgmEnabled(event.target.checked)}
    />
    配置背景音乐
  </label>
  <input
    value={bgmRequest}
    onChange={(event) => setBgmRequest(event.target.value)}
    className="h-9 rounded-md border border-[#cbd5e1] px-2 text-sm"
    placeholder="例如：轻快、干净、适合门店探访，不要人声"
    disabled={!bgmEnabled}
  />
  <label className="flex items-center gap-2 text-sm text-[#334155]">
    <input
      type="checkbox"
      checked={includeOriginalAudio}
      onChange={(event) => setIncludeOriginalAudio(event.target.checked)}
    />
    保留素材原声
  </label>
</div>
```

- [ ] **Step 4: Mirror minimal production config in video workbench**

In `app/src/components/merchant/video-workbench.tsx`, add equivalent state:

```tsx
const [voiceoverProvider, setVoiceoverProvider] = useState<"bytedance_bigtts" | "minimax" | "302">("bytedance_bigtts");
const [bgmRequest, setBgmRequest] = useState("");
```

In `createVideoJob`, add:

```tsx
          productionConfig: {
            voiceover: { enabled: true, provider: voiceoverProvider, volume: 2 },
            bgm: { enabled: true, userRequest: bgmRequest || extraRequirement, include: {}, exclude: {}, volume: 0.25 },
            subtitles: { enabled: true, style: "platform_default" },
            render: { aspectRatio: "9:16", includeOriginalAudio: false },
          },
```

Place simple controls near the existing `extraRequirement` input:

```tsx
<select
  value={voiceoverProvider}
  onChange={(event) => setVoiceoverProvider(event.target.value as "bytedance_bigtts" | "minimax" | "302")}
  className="h-9 rounded-md border border-[#cbd5e1] bg-white px-2 text-sm"
>
  <option value="bytedance_bigtts">火山 BigTTS</option>
  <option value="minimax">MiniMax</option>
  <option value="302">302</option>
</select>
<input
  value={bgmRequest}
  onChange={(event) => setBgmRequest(event.target.value)}
  className="h-9 rounded-md border border-[#cbd5e1] px-2 text-sm"
  placeholder="背景音乐要求"
/>
```

- [ ] **Step 5: Run app checks**

Run:

```powershell
cd app
pnpm lint
pnpm typecheck
```

Expected: lint and typecheck pass.

- [ ] **Step 6: Commit**

```powershell
git add app\src\components\dashboard\draft-video-panels.tsx `
  app\src\components\merchant\video-workbench.tsx `
  app\src\lib\ui\video-workflow.ts
git commit -m "feat: add video production controls"
```

---

### Task 7: Add FireRed Production Smoke Procedure

**Files:**
- Modify: `workers/video-worker/README.md`
- Add: `workers/video-worker/tests/test_firered_payload_smoke.py`

- [ ] **Step 1: Add a payload-only smoke test**

Create `workers/video-worker/tests/test_firered_payload_smoke.py`:

```python
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from openstoryline.app.config import Settings
from openstoryline.app.engine_adapters import create_engine_adapter
from openstoryline.app.schemas import RunRequest


class MockHttpResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "session_id": "smoke-session",
            "final_video_path": "/tmp/final.mp4",
            "raw_response": {"engine": "fire_red-openstoryline"},
        }


class FireRedPayloadSmokeTests(unittest.TestCase):
    def test_fire_red_payload_contains_production_config_and_service_config(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            tts_provider="minimax",
            tts_minimax_base_url="https://api.minimax.io",
            tts_minimax_api_key="minimax-secret",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="smoke-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked smoke script",
                    production_directive={"script_locked": True, "desired_outputs": ["final_video"]},
                    production_config={
                        "voiceover": {"enabled": True, "provider": "minimax"},
                        "bgm": {"enabled": True, "user_request": "light upbeat", "include": {}, "exclude": {}, "volume": 0.25},
                        "subtitles": {"enabled": True, "style": "platform_default"},
                        "render": {"aspect_ratio": "9:16", "include_original_audio": False},
                    },
                )
            )

        payload = post.call_args.kwargs["json"]
        self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
        self.assertEqual("minimax-secret", payload["service_config"]["tts"]["minimax"]["api_key"])
        self.assertEqual("light upbeat", payload["production_config"]["bgm"]["user_request"])
```

- [ ] **Step 2: Run the smoke test**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_firered_payload_smoke.py -v
```

Expected: test passes without starting Docker.

- [ ] **Step 3: Add manual server smoke instructions**

Append this to `workers/video-worker/README.md`:

```markdown
## FireRed production smoke

Run this only on a machine with FireRed resources and provider secrets prepared.

```bash
cp .env.example .env
# Fill SUPABASE_DB_URL, COS credentials, FIRERED_PROVIDER_KEY,
# OPENSTORYLINE_LLM_*, OPENSTORYLINE_VLM_*, and selected TTS_* fields.
docker compose --profile firered up --build
```

Expected health checks:

```bash
docker compose exec openstoryline-engine python - <<'PY'
import urllib.request, json
print(json.dumps(json.loads(urllib.request.urlopen("http://127.0.0.1:8000/health").read()), indent=2))
PY
```

Expected values:

- `engine_adapter` is `fire_red`
- `fire_red_base_url_configured` is `true`
- `fire_red_provider_key_configured` is `true`

Submit a job through the platform, then verify the resulting `final.mp4` has a
non-empty audio stream:

```bash
ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 /srv/jingjing-video-worker/outputs/<job-id>/final.mp4
```

Expected output contains `audio`.
```

- [ ] **Step 4: Run full worker tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

Expected: all worker tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workers\video-worker\README.md workers\video-worker\tests\test_firered_payload_smoke.py
git commit -m "test: add firered production payload smoke"
```

---

### Task 8: Final Verification And Handoff

**Files:**
- Add: `docs/progress/2026-04-28-openstoryline-production-engine-progress.md`
- Add: `docs/handoff/2026-04-28-openstoryline-production-engine-handoff.md`

- [ ] **Step 1: Run app verification**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
pnpm lint
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 2: Run worker verification**

Run from repo root:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

Expected: all pass.

- [ ] **Step 3: Write progress record**

Create `docs/progress/2026-04-28-openstoryline-production-engine-progress.md`:

```markdown
# 2026-04-28 OpenStoryline Production Engine Progress

## Completed

- Added platform `productionConfig` contract for voiceover, BGM, subtitles, and render settings.
- Added worker-side production config validation.
- Forwarded production config through `openstoryline-engine /v1/runs`.
- Mapped production config to FireRed `/api/worker/runs` payload and `service_config`.
- Added structured app controls for basic voiceover and BGM choices.
- Removed concrete provider keys from FireRed config templates.

## Verification

- `node --test src/server/api/video-job-payload.test.ts`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `python -m unittest discover -s workers/video-worker/tests -v`: pass

## Not Yet Verified

- Real FireRed provider call with live LLM/VLM/TTS credentials.
- Real BGM resource selection from mounted `resource/bgms`.
- End-to-end COS upload from a live `video_edit_jobs` row.
```

- [ ] **Step 4: Write handoff**

Create `docs/handoff/2026-04-28-openstoryline-production-engine-handoff.md`:

```markdown
# 2026-04-28 OpenStoryline Production Engine Handoff

## Goal

Enable the platform worker to call the full FireRed OpenStoryline production engine with structured voiceover, BGM, subtitle, and render configuration.

## Branch / Worktree

- Branch: `codex/openstoryline-production-engine`
- Worktree: `D:\codexplan\work\jingjing-content-platform-openstoryline-prod`

## Current Status

Code-level mapping is complete and unit tests pass. Real provider smoke still requires prepared server resources and secrets.

## Required Server Inputs

- `FIRERED_PROVIDER_KEY`
- `OPENSTORYLINE_LLM_MODEL`
- `OPENSTORYLINE_LLM_BASE_URL`
- `OPENSTORYLINE_LLM_API_KEY`
- `OPENSTORYLINE_VLM_MODEL`
- `OPENSTORYLINE_VLM_BASE_URL`
- `OPENSTORYLINE_VLM_API_KEY`
- selected `TTS_*` provider values
- mounted FireRed `.storyline` and `resource` directories

## Merge / Push

- Push: not done unless user asks.
- Merge: not done unless user asks.
```

- [ ] **Step 5: Commit docs**

```powershell
git add docs\progress\2026-04-28-openstoryline-production-engine-progress.md `
  docs\handoff\2026-04-28-openstoryline-production-engine-handoff.md
git commit -m "docs: record openstoryline production integration"
```

- [ ] **Step 6: Report final status**

Include:

- branch name
- final commit hash
- tests run and results
- files changed summary
- whether real FireRed server smoke was run
- remaining server-only prerequisites

---

## Follow-Up Plan Needed After This Slice

Create a separate plan after the first real video smoke passes:

- persist FireRed `session_id` and selected artifact metadata in `result_payload`
- add revision job creation that reuses source job context
- add cost guardrails for provider calls
- add stage-level event logging from FireRed node progress into platform job logs
- add a server-only resource readiness endpoint for operator diagnostics

These are intentionally not mixed into this first implementation slice because they depend on a stable real FireRed execution path.
