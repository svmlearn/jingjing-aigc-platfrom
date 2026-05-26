# 2026-05-23 video script route duration 600s

## Scope

- Local branch: `codex/5.23.1.video-fix`.
- Base branch: remote `5.23-worker-fix`.
- Change only the synchronous video script and video workbench agent route runtime windows.
- No server hot update was performed in the code change step.

## Change

The following Next.js route handlers now export `maxDuration = 600` instead of `60`:

- `app/src/app/api/content/video-scripts/route.ts`
- `app/src/app/api/content/video-scripts/revisions/route.ts`
- `app/src/app/api/content/video-workbench-agent/route.ts`

These routes can call script generation, revision, and workbench agent flows that may exceed the old 50-60 second platform window. The new value keeps the endpoint bounded while matching the requested 600 second ceiling.

## Verification Plan

- Run the new route duration contract test.
- Run typecheck, lint, and build before committing.
- Push the committed branch to Gitee before any server release.

## Local Verification

- `node --test src/server/api/video-script-route-duration.test.ts`: passed.
  - Node emitted the existing TS ESM package-type warning used by other local tests; the test itself passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed with existing unused-import warnings, no errors.
- `corepack pnpm build`: passed.
- `git diff --check`: passed.

## Release Rule

Follow the user-confirmed flow:

1. Modify and verify on the local branch first.
2. Commit and push to Gitee.
3. Deploy to the server through a new release directory from the committed source.
4. Do not directly hot-patch files under the active server release.

## Gitee Push

- Commit: `5a4fdebc7a4a070a4ca8b0cc47a3155e9d9fb84c`
- Branch pushed: `5.23-worker-fix`
- Push command used after bypassing the unavailable local proxy:
  - `git -c http.proxy= -c https.proxy= push origin HEAD:5.23-worker-fix`

## Server Release

- Server: `meng@8.154.28.41`
- Previous release: `/srv/jingjing-domestic/releases/20260523004542-92f0e3a`
- New release: `/srv/jingjing-domestic/releases/20260523120534-5a4fdeb`
- Current symlink after release:
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260523120534-5a4fdeb`

Release flow:

1. Uploaded committed archive to `/tmp/jingjing-5a4fdeb.tar`.
2. Created the new release directory.
3. Extracted the archive and set release ownership to `ubuntu:ubuntu`.
4. Ran server build in the new release:
   - `corepack pnpm@10.20.0 install --frozen-lockfile`
   - `corepack pnpm@10.20.0 build`
5. Switched `/srv/jingjing-domestic/current` only after build passed.
6. Restarted:
   - `jingjing-domestic-app.service`
   - `jingjing-content-generation-worker.service`
   - `jingjing-firered-openstoryline.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-video-worker.service`
7. Reloaded `nginx.service`.

## Stopped Stale Tasks Before Release

User confirmed the server tasks were problematic and should be stopped before release.

- `video_edit_jobs`
  - `18058674-b17f-4337-9c3b-4edcac0ff81b`
  - Final status: `cancelled`
  - Failure code: `manual_stopped`
  - Reason: `manually_stopped_before_2026_05_23_video_duration_release`
- `content_generation_jobs`
  - `90dd08b1-fad7-4c3f-8689-cf2b52775ea1`
  - Final status: `canceled`
  - Reason: `manually_stopped_before_2026_05_23_video_duration_release`
  - Batch `9ef286aa-b4ca-4bed-85a8-2048c89b17a5` recomputed to `running_jobs = 0`.

Note: `video-worker` was first stopped because it heartbeated the video job back to `running`; after the service stopped, the job was updated to `cancelled` and in-flight video jobs became empty.

## Server Verification

- `systemctl is-active` after release:
  - `nginx.service`: active
  - `jingjing-domestic-app.service`: active
  - `jingjing-content-generation-worker.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active
- `http://127.0.0.1:3000/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- `http://127.0.0.1:8000/ready`: ready, `engine_adapter=fire_red`.
- `http://127.0.0.1:7860/api/ready`: ready, `tool_count=21`, `render_video_available=true`.
- Source check under `/srv/jingjing-domestic/current`:
  - three target routes all contain `export const maxDuration = 600;`.
- In-flight queue check after release:
  - `video_edit_jobs`: `[]`
  - `content_generation_jobs`: `[]`
