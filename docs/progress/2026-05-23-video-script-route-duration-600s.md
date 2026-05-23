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
