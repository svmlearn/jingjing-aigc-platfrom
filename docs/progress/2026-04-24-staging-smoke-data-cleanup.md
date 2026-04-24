# 2026-04-24 staging smoke data cleanup

## Context

User noticed two same-name consultation session chips on staging dashboard:

- `静境 Staging Smoke 8-305a30 咨询诊断`

These were not product concepts. They were old consultation sessions created by Codex smoke / acceptance tests. The assistant reply about Pilates also came from the old smoke merchant context, so it was not suitable for a clean from-zero acceptance test.

## Cleanup scope

Only Codex-created smoke data was targeted:

- Auth users with emails starting:
  - `codex-smoke-`
  - `codex-real-ai-`
- Smoke merchants:
  - `静境 Staging Smoke 8-305a30`
  - `静境 Real AI Smoke 20260424100257`
- Smoke platform knowledge documents:
  - `Staging Smoke Knowledge 2026-04-24T08:02:27`
  - `Real AI Smoke Knowledge JJ-REAL-AI-20260424100257-7CDB1F`
- Smoke invitation codes:
  - `JJ-SMOKE-20260424075628-305A30`
  - `JJ-REAL-AI-20260424100257-45F5`

## Deleted counts

- `invitation_codes`: 2
- `asset_objects` for content variants: 3
- `video_edit_jobs`: 1
- `content_drafts`: 2
- `source_items`: 2
- `consultation_sessions`: 3
- `knowledge_documents`: 2
- `merchant_profiles`: 2
- Auth users deleted: 2

Verification after cleanup:

- Remaining smoke merchants: 0
- Remaining smoke knowledge documents: 0

## Fresh test invite

Created a clean one-time invite for user acceptance testing:

- Code: `JJ-CLEAN-202604241014-1AC8`
- Status: `active`
- Max redemptions: 1
- Redemption count: 0

The in-app browser was navigated to:

- `https://jingjing-content-platform-staging.vercel.app/register`

The invite field was prefilled with:

- `JJ-CLEAN-202604241014-1AC8`

## Notes

- This cleanup removed UI-visible staging smoke rows from Supabase and auth.
- It did not delete orphaned Tencent COS object files from previous smoke video jobs.
- Temporary local secret files from deployment work still exist under `/tmp`; do not paste them into chat or docs. Delete them only after explicit user confirmation.
