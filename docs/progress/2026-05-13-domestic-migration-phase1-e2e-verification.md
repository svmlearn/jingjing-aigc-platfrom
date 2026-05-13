# 2026-05-13 domestic migration phase1 e2e verification

## 1. Status

Status: pending real domestic resources.

This document is the required evidence container for the first-phase domestic IP verification. It must stay pending until the full chain has actually run on domestic infrastructure:

`手机浏览器 -> domestic IP page -> login -> upload material -> video_edit_jobs -> worker -> final.mp4 -> 国内 COS -> 重新签名下载`

The completion pass marker is intentionally absent.

## 2. Required environment

Fill these without exposing secrets:

- App URL or IP:
- App server region:
- PostgreSQL provider / region:
- PostgreSQL migration command:
- COS bucket:
- COS region:
- COS CORS rule checked:
- Worker host:
- Worker concurrency:
- FireRed / OpenStoryline runtime location:
- Test phone / browser:

## 3. Verification checklist

| Step | Required evidence | Result |
| --- | --- | --- |
| Health check | `GET /api/health` response status and redacted JSON | Pending |
| Mobile open | 手机浏览器 can open the domestic IP page | Pending |
| Login | domestic session cookie created after owner login | Pending |
| Upload intent | `/api/media/upload-intents` returns domestic COS bucket, region, key prefix and temporary credential metadata | Pending |
| Real COS upload | Browser uploads a video object to 国内 COS; object key recorded | Pending |
| Media complete | `/api/media/complete` writes `asset_objects` with `bucket_name + storage_key` | Pending |
| Video job create | `/api/video-edit-jobs` creates a `pending` row; record `video_edit_jobs.id` | Pending |
| Worker claim | worker claims the row, writes `worker_id`, `claimed_at`, `heartbeat_at` | Pending |
| Worker run | worker stage logs show prepare / storyboard / render / upload timing | Pending |
| Final upload | `final.mp4` is present in 国内 COS and recorded in result asset metadata | Pending |
| Signed download | Page re-signs final asset and downloads or previews `final.mp4` | Pending |
| Failure controls | Timeout / failure reason / manual rerun path checked or explicitly deferred | Pending |

## 4. Evidence log

Add timestamped entries here during the real run.

### Attempt 1

- Started at:
- Operator:
- App commit:
- Worker commit:
- Database migration result:
- Seed / account used:
- Upload source:
- `video_edit_jobs.id`:
- Worker log excerpt:
- Final COS object:
- Signed download result:
- Result:

## 5. Completion rule

Only after every required step above is verified on real domestic infrastructure should this document be updated with the explicit completion marker required by `.codex/long-task/contract.json`.
