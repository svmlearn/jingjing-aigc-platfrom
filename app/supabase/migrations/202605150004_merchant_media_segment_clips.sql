do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.merchant_media_clips'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%clip_index = 0%'
        or pg_get_constraintdef(oid) like '%full_video%image%'
        or pg_get_constraintdef(oid) like '%start_time_seconds = 0%'
      )
  loop
    execute format(
      'alter table public.merchant_media_clips drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.merchant_media_clips
  add column if not exists bucket_name text,
  add column if not exists mime_type text;

update public.merchant_media_clips
set bucket_name = coalesce(
  bucket_name,
  current_setting('app.cos_bucket', true),
  'unknown-private-bucket'
)
where bucket_name is null;

update public.merchant_media_clips
set mime_type = coalesce(
  mime_type,
  case when media_type = 'image' then 'image/jpeg' else 'video/mp4' end
)
where mime_type is null;

alter table public.merchant_media_clips
  alter column bucket_name set not null,
  alter column mime_type set not null;

alter table public.merchant_media_clips
  add constraint merchant_media_clips_media_type_check_v2
  check (media_type in ('image', 'video'));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_clip_index_nonnegative_v2
  check (clip_index >= 0);

alter table public.merchant_media_clips
  add constraint merchant_media_clips_clip_type_check_v2
  check (clip_type in ('full_video', 'segment', 'image'));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_orientation_check_v2
  check (orientation in ('portrait', 'landscape'));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_status_check_v2
  check (status in ('ready', 'tagging_failed', 'archived', 'quarantined', 'missing_object'));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_tags_array_check_v2
  check (jsonb_typeof(tags) = 'array');

alter table public.merchant_media_clips
  add constraint merchant_media_clips_tags_minimum_check_v2
  check (jsonb_array_length(tags) >= 3);

alter table public.merchant_media_clips
  add constraint merchant_media_clips_tag_source_check_v2
  check (tag_source in ('fixture', 'mock', 'manual', 'vision_model'));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_tag_confidence_check_v2
  check (tag_confidence is null or (tag_confidence >= 0 and tag_confidence <= 1));

alter table public.merchant_media_clips
  add constraint merchant_media_clips_dimensions_check_v2
  check (width > 0 and height > 0);

alter table public.merchant_media_clips
  add constraint merchant_media_clips_timing_check_v2
  check (
    (
      media_type = 'video'
      and clip_type = 'full_video'
      and start_time_seconds = 0
      and duration_seconds is not null
      and duration_seconds > 0
      and end_time_seconds = duration_seconds
    )
    or (
      media_type = 'video'
      and clip_type = 'segment'
      and start_time_seconds is not null
      and start_time_seconds >= 0
      and end_time_seconds is not null
      and end_time_seconds > start_time_seconds
      and duration_seconds is not null
      and duration_seconds > 0
    )
    or (
      media_type = 'image'
      and clip_type = 'image'
      and start_time_seconds is null
      and end_time_seconds is null
      and duration_seconds is null
    )
  );
