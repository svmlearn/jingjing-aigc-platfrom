# OpenStoryline Production Engine Runtime Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a safe FireRed OpenStoryline production runtime surface without committing provider secrets or runtime assets.

**Architecture:** Keep the existing `openstoryline-engine` wrapper and `firered-openstoryline` compose profile. This execution file only prepares runtime configuration, environment variables, and operator documentation; it does not change platform payload contracts or UI.

**Tech Stack:** Docker Compose, FireRed OpenStoryline, Python 3.11, ffmpeg, PowerShell, Markdown.

---

## Scope

This file is execution slice 1 of 3. It covers the master plan's Task 0 and Task
1. After this file is complete, FireRed can be configured safely, but platform
jobs still use the existing contract until slice 2 is implemented.

## Files

- Modify: `workers/video-worker/openstoryline/firered/config.toml`
- Modify: `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- Modify: `workers/video-worker/.env.example`
- Modify: `workers/video-worker/docker-compose.yml`
- Modify: `workers/video-worker/README.md`

---

### Task 1: Create The Implementation Worktree

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Check the current worktree**

Run from `D:\codexplan\work\jingjing-content-platform`:

```powershell
git status --short --branch
```

Expected: unrelated untracked or modified files may be visible. Do not stage or
edit them for this task.

- [ ] **Step 2: Create a dedicated branch worktree**

Run:

```powershell
git worktree add ..\jingjing-content-platform-openstoryline-prod -b codex/openstoryline-production-engine
```

Expected: a new worktree exists at
`D:\codexplan\work\jingjing-content-platform-openstoryline-prod`.

- [ ] **Step 3: Re-read local project context in the new worktree**

Run from the new worktree:

```powershell
Get-Content -Encoding UTF8 -LiteralPath AGENTS.md
Get-Content -Encoding UTF8 -LiteralPath docs\README.md
Get-Content -Encoding UTF8 -LiteralPath docs\superpowers\specs\2026-04-28-openstoryline-production-engine-design.md
```

Expected: implementation proceeds from checked-in project context.

---

### Task 2: Clean FireRed Config Secrets

**Files:**
- Modify: `workers/video-worker/openstoryline/firered/config.toml`
- Modify: `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`

- [ ] **Step 1: Run the current secret scan**

Run:

```powershell
Select-String -Encoding UTF8 -Path `
  'workers\video-worker\openstoryline\firered\config.toml',`
  'workers\video-worker\openstoryline\firered\config.video_edit_engine.toml' `
  -Pattern 'api_key = "sk-|api_key = "[a-zA-Z0-9]{20,}|access_key = "[a-zA-Z0-9]{20,}'
```

Expected before implementation: matches may appear. Expected after this task:
no output.

- [ ] **Step 2: Replace LLM and VLM credentials with env placeholders**

In both config files, make the LLM and VLM sections use this shape:

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

- [ ] **Step 3: Replace AI transition credentials with env placeholders**

Use this shape in both config files:

```toml
[generate_ai_transition.providers.dashscope]
model_name = "wan2.2-kf2v-flash"
api_key = "${AI_TRANSITION_DASHSCOPE_API_KEY:-}"

[generate_ai_transition.providers.minimax]
model_name = "MiniMax-Hailuo-02"
api_key = "${AI_TRANSITION_MINIMAX_API_KEY:-}"
```

- [ ] **Step 4: Verify the scan is clean**

Run the same `Select-String` command from Step 1.

Expected: no output.

---

### Task 3: Add FireRed Provider Environment Surface

**Files:**
- Modify: `workers/video-worker/.env.example`
- Modify: `workers/video-worker/docker-compose.yml`

- [ ] **Step 1: Add TTS and AI transition fields to `.env.example`**

Append this block under the OpenStoryline provider section:

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

- [ ] **Step 2: Pass the same variables into both engine services**

In `workers/video-worker/docker-compose.yml`, add this environment block to
both `openstoryline-engine.environment` and
`firered-openstoryline.environment`:

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

- [ ] **Step 3: Check compose syntax**

Run:

```powershell
docker compose -f workers\video-worker\docker-compose.yml config
```

Expected: compose renders without YAML errors. If Docker is unavailable on the
machine, record that this check was not run in the final progress note.

---

### Task 4: Document FireRed Resource Requirements

**Files:**
- Modify: `workers/video-worker/README.md`

- [ ] **Step 1: Add production assets section**

Add this section after the FireRed routing example:

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

- [ ] **Step 2: Verify docs and secret state**

Run:

```powershell
Select-String -Encoding UTF8 -LiteralPath 'workers\video-worker\README.md' -Pattern 'FireRed production assets'
Select-String -Encoding UTF8 -Path `
  'workers\video-worker\openstoryline\firered\config.toml',`
  'workers\video-worker\openstoryline\firered\config.video_edit_engine.toml' `
  -Pattern 'api_key = "sk-|api_key = "[a-zA-Z0-9]{20,}|access_key = "[a-zA-Z0-9]{20,}'
```

Expected: first command finds the heading; second command has no output.

- [ ] **Step 3: Commit this execution slice**

Run:

```powershell
git add workers\video-worker\openstoryline\firered\config.toml `
  workers\video-worker\openstoryline\firered\config.video_edit_engine.toml `
  workers\video-worker\.env.example `
  workers\video-worker\docker-compose.yml `
  workers\video-worker\README.md
git commit -m "chore: configure firered production providers"
```

