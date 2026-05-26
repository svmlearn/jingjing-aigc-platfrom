# 2026-05-26 zhiluan1 visible script batch fix

## Scope

- Branch: `codex/zhiluan1-visible-script-batch-fix`
- Trigger: frontend still showed the old scene 5 script after release `aff43a4`.
- Root cause: `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs` only patched one fixed daily task, while the frontend was opening later `zhiluan1` factory tasks that still had the old script.

## Evidence

Server readback before this fix found 9 matching `厂房宣传` / `zhiluan1` tasks with title `找厂房，别只看租金`:

- `39946899-d5ec-45a1-9203-18799554da24`, task date `2026-05-22T16:00:00.000Z`: already corrected to scene 5 `园区公共配套`.
- `27307400-fbb2-4b8f-8cfa-2a3a8199543b`, task date `2026-05-23T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `025cd5eb-b296-4f65-8df9-c026620175c6`, task date `2026-05-24T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `d9b7e24f-3fb2-4192-9ca4-7a96ef1a12d7`, task date `2026-05-25T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `d1e1aa55-9125-4601-b5a6-c16a2754f64d`, task date `2026-05-26T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `07fc7aaa-5913-460b-949c-e51673774ee0`, task date `2026-05-27T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `83f52a00-00b1-4f9f-a672-e954bb99b147`, task date `2026-05-28T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `9de5a75f-d9ae-4e45-b93a-f828690422d3`, task date `2026-05-29T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.
- `56cebe2d-d28b-4587-86a4-d01cb2d69f29`, task date `2026-05-30T16:00:00.000Z`: old scene 5 `园区管理和公共配套`.

All 9 rows were still `video_script_created`, so this is safe to correct at script-data level before generating a video.

## Change

Updated `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`:

- Keeps the original single-task behavior by default.
- Adds `--all-matching-factory-tasks`.
- Batch mode only selects rows matching:
  - merchant `e7c94a17-cf7d-4eb2-8178-13daa780551a`
  - member user `0b3351a6-778b-4e79-b5f1-6aa18fdb0020`
  - status `video_script_created`
  - theme `一楼厂房主推`
  - title `找厂房，别只看租金`
  - manual factory assignment source or marker
  - existing `contentDraftId` and `contentVariantId`
- Dry-run and apply output now includes task ids, task date, previous scene 5, patched scene 5, production scene count, and talking-head scene numbers.

## Validation

Local checks before commit:

```bash
node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs
node --check app/scripts/fix-factory-member-video-tasks.mjs
git diff --check
```

Results:

- Both `node --check` commands passed.
- `git diff --check` passed; Windows line-ending warnings only.

## Release Plan

1. Commit on `codex/zhiluan1-visible-script-batch-fix`.
2. Fast-forward local `main`.
3. Push local `main` to `origin/5.26-worker-fix`; do not push `origin/main`.
4. Build a clean server release from that commit.
5. After the new release is active, run:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --all-matching-factory-tasks --apply
```

6. Read back all matching tasks and confirm scene 5 is `园区公共配套` with materials `消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处`.
