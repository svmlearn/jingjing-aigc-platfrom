# 2026-05-26 zhiluan1 visible script batch fix handoff

## Goal

Fix the frontend-visible old zhiluan1 factory script rows that were missed by the first release patch. The previous release corrected only one fixed daily task, but the member UI can open later calendar tasks that still contain the old scene 5 wording.

## Branch

- Branch: `codex/zhiluan1-visible-script-batch-fix`
- Base: local `main` at docs commit `fd59518`
- Target remote after merge: `origin/5.26-worker-fix`
- Do not push `origin/main`.

## Diagnosis

Server readback showed:

- 1 already-correct matching task: `39946899-d5ec-45a1-9203-18799554da24`.
- 8 still-old matching tasks, all `video_script_created`, spanning task dates `2026-05-23T16:00:00.000Z` through `2026-05-30T16:00:00.000Z`.
- Old scene 5 title: `园区管理和公共配套`.
- Old scene 5 line: `园区里面有管理服务站，消防疏散图、厂区平面图、电梯和管理信息都能看到，日常使用不用只靠口头承诺。`

This explains why the frontend could still show old text after release: it was not reading the one patched daily task.

## Changed File

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`

## What Changed

- The patch script now supports `--all-matching-factory-tasks`.
- Default behavior remains single-target patching for the known restored task.
- Batch behavior is constrained to the same merchant, same member, same factory theme, same title, same manual factory assignment, and `video_script_created` status.
- Output now reports previous and patched scene 5 per target so the release operator can verify the exact rows before applying.

## Validation

Completed locally:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed
- `git diff --check`: passed, line-ending warnings only

## Release Steps

1. Commit this branch.
2. Switch to local `main`.
3. Fast-forward merge:

```bash
git merge --ff-only codex/zhiluan1-visible-script-batch-fix
```

4. Push local main to Gitee worker branch:

```bash
git push origin main:5.26-worker-fix
```

5. Build and activate a clean release from the final local main commit.
6. Run dry-run from the active release path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --all-matching-factory-tasks
```

Expected dry-run: `targetCount` is 9, with 8 previous scene 5 rows still old and patched scene 5 set to `园区公共配套`.

7. Apply from the active release path:

```bash
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --all-matching-factory-tasks --apply
```

8. Read back all matching tasks before allowing frontend generation.

## Frontend Testing Gate

Do not tell the user to test generation until readback confirms all matching `zhiluan1` factory tasks now show:

- target duration `60`
- 6 generated scenes
- 6 production scenes
- scene 5 title `园区公共配套`
- scene 5 materials `消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处`
