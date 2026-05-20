import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationSql = readFileSync(
  resolve("supabase/migrations/202605150002_merchant_media_library.sql"),
  "utf8",
);
const segmentMigrationSql = readFileSync(
  resolve("supabase/migrations/202605150004_merchant_media_segment_clips.sql"),
  "utf8",
);

test("merchant media migration creates explicit merchant-scoped tables and indexes", () => {
  assertIncludes("create table if not exists public.merchant_media_assets");
  assertIncludes("create table if not exists public.merchant_media_clips");
  assertIncludes("merchant_id uuid not null references public.merchant_profiles");
  assertIncludes("uploaded_by_user_id uuid not null references auth.users");
  assertIncludes("bucket_name text not null");
  assertIncludes("mime_type text not null");
  assertIncludes("create index if not exists idx_merchant_media_assets_merchant_status_created_at");
  assertIncludes("create index if not exists idx_merchant_media_clips_merchant_media_status");
  assertIncludes("create unique index if not exists ux_merchant_media_assets_idempotency");
  assertIncludes("create unique index if not exists ux_merchant_media_clips_asset_index");
});

test("merchant media migration encodes ready full_video/segment/image slice constraints", () => {
  assertIncludes("check (clip_index >= 0)");
  assertIncludes("check (clip_type in ('full_video', 'segment', 'image'))");
  assertIncludes("and start_time_seconds = 0");
  assertIncludes("and end_time_seconds = duration_seconds");
  assertIncludes("and clip_type = 'segment'");
  assertIncludes("and end_time_seconds > start_time_seconds");
  assertIncludes("and duration_seconds is null");
  assertIncludes("tag_source in ('fixture', 'mock', 'manual', 'vision_model')");
});

test("merchant media segment migration loosens existing V1 checks safely", () => {
  assert.ok(segmentMigrationSql.includes("drop constraint if exists"));
  assert.ok(segmentMigrationSql.includes("merchant_media_clips_clip_index_nonnegative_v2"));
  assert.ok(segmentMigrationSql.includes("merchant_media_clips_clip_type_check_v2"));
  assert.ok(segmentMigrationSql.includes("add column if not exists bucket_name text"));
  assert.ok(segmentMigrationSql.includes("add column if not exists mime_type text"));
  assert.ok(segmentMigrationSql.includes("clip_type in ('full_video', 'segment', 'image')"));
  assert.ok(segmentMigrationSql.includes("merchant_media_clips_timing_check_v2"));
});

test("merchant media migration blocks temporary and voice profile sources from merchant_media_*", () => {
  assertIncludes("check (media_type in ('image', 'video'))");
  assertIncludes("check (source in ('merchant_upload', 'merchant_confirmed'))");
  assert.equal(migrationSql.includes("member_task_temp"), false);
  assert.equal(migrationSql.includes("voice_profile"), false);
});

test("merchant media migration enables RLS with owner and team member read policies", () => {
  assertIncludes("alter table public.merchant_media_assets enable row level security");
  assertIncludes("alter table public.merchant_media_clips enable row level security");
  assertIncludes("merchant_media_assets_owner_read");
  assertIncludes("merchant_media_assets_team_member_read");
  assertIncludes("merchant_media_clips_owner_read");
  assertIncludes("merchant_media_clips_team_member_read");
  assertIncludes("mtm.user_id = auth.uid()");
  assertIncludes("mtm.status = 'active'");
});

function assertIncludes(fragment: string) {
  assert.ok(migrationSql.includes(fragment), `missing SQL fragment: ${fragment}`);
}
