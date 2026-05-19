# 2026-05-16 Singapore self-hosted rehearsal handoff

## Current status

Singapore self-hosted rehearsal is passed after rebuilding from commit
`f03765cd1afc6bd05a5fccfee694c8f974d47008`.

Domestic real Phase 1 is still pending. The project long-task remains blocked.

Do not treat this as domestic completion evidence.

## Branch / worktree

- Worktree:
  `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Source commit deployed to Singapore:
  `f03765cd1afc6bd05a5fccfee694c8f974d47008`
- Push / merge: not pushed, not merged
- Completion marker: not written

## Remote runtime

- Server: `43.160.208.189`
- App public IP-stage URL: `http://43.160.208.189`
- App internal port: `3002`
- Nginx IP-stage proxy: Docker `nginx:1.27-alpine` on port `80`
- Rehearsal release root:
  `/srv/jingjing-selfhost-rehearsal/current`
- App env: `/etc/jingjing/app.env`
- Worker env: `/etc/jingjing/worker.env`
- Secret values must stay out of docs and chat.

Running services:

- `jingjing-selfhost-app.service`: active
- `jingjing-ip-stage-nginx.service`: active
- `jingjing-worker-compose.service`: active/exited after compose up
- `jingjing-selfhost-pg`: running
- `openstoryline-engine`: running, healthy
- `firered-openstoryline`: running, healthy
- `video-worker`: running

## Evidence files

Primary progress evidence:

```text
docs/progress/2026-05-16-singapore-self-hosted-rehearsal-redeploy.md
```

Browser screenshot:

```text
/tmp/jingjing-rehearsal/ip-stage-dashboard-video.png
```

## Important findings

1. `/etc/jingjing/app.env` and `/etc/jingjing/worker.env` were missing at the
   start of the run. They were restored from the existing rehearsal files under
   `/srv/jingjing-selfhost-rehearsal/` and installed as root-only `0600`.
2. Public `:3002` still timed out externally. The fix was Nginx on port `80`
   reverse proxying to `127.0.0.1:3002`.
3. Browser direct COS upload initially failed due to missing CORS for
   `http://43.160.208.189`.
4. Runtime COS keys could not update bucket CORS (`AccessDenied`), so CORS was
   updated through the Tencent Cloud console browser session.
5. Normal FireRed small synthetic job succeeded once. This is better than the
   previous run, where ordinary FireRed failed.
6. Fast path also succeeded, but it remains only infrastructure wiring evidence.

## Key job evidence

Normal FireRed job:

- Job id: `677d58da-2dbb-454c-9581-23f2a2502e1b`
- Status: `succeeded`
- Execution mode: `staging_worker`
- Final:
  `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/677d58da-2dbb-454c-9581-23f2a2502e1b/final.mp4`
- Browser signed preview fetch: `200`, `16642` bytes

Fast-path job:

- Job id: `c5db6030-b12b-435d-953a-183be88fbcc3`
- Status: `succeeded`
- Execution mode: `self_hosted_rehearsal_fast_path`
- Final:
  `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/c5db6030-b12b-435d-953a-183be88fbcc3/final.mp4`
- Browser signed preview fetch: `200`, `3235` bytes

## Validation passed

- App build
- App internal `/api/health`
- Public IP-stage `/api/health`
- App preflight
- COS roundtrip
- API smoke
- Worker real I/O smoke
- Worker unittest: `Ran 51 tests ... OK`
- Browser login
- Browser direct COS upload
- Browser `media complete`
- Browser job creation
- Worker claim / render / output upload / DB writeback
- Browser job detail re-sign and signed preview fetch

## Still pending

- Mainland ECS / RDS PostgreSQL / OSS purchase and verification.
- ICP / domain / HTTPS.
- Domestic phone/browser real e2e against mainland resources.
- Long-task completion gate.

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task` complete.
Do not push or merge unless the user explicitly asks.
