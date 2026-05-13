with ranked_in_flight_jobs as (
  select
    id,
    row_number() over (
      partition by merchant_id, created_by_user_id, draft_id, content_variant_id
      order by created_at asc, id asc
    ) as rank_no
  from public.video_edit_jobs
  where status in ('pending', 'queued', 'preparing', 'running')
)
update public.video_edit_jobs jobs
set
  status = 'cancelled',
  current_stage = coalesce(jobs.current_stage, 'deduplicated_in_flight_job'),
  finished_at = coalesce(jobs.finished_at, timezone('utc', now())),
  log_payload = coalesce(jobs.log_payload, '{}'::jsonb) || jsonb_build_object(
    'deduplicated_in_flight_job',
    jsonb_build_object(
      'reason', 'Cancelled duplicate in-flight video edit job before unique index creation.',
      'cancelled_at', timezone('utc', now())
    )
  ),
  updated_at = timezone('utc', now())
from ranked_in_flight_jobs ranked
where jobs.id = ranked.id
  and ranked.rank_no > 1;

create unique index if not exists ux_video_edit_jobs_one_in_flight_per_creator_variant
on public.video_edit_jobs (merchant_id, created_by_user_id, draft_id, content_variant_id)
where status in ('pending', 'queued', 'preparing', 'running')
  and created_by_user_id is not null;

create unique index if not exists ux_video_edit_jobs_one_in_flight_per_owner_variant
on public.video_edit_jobs (merchant_id, draft_id, content_variant_id)
where status in ('pending', 'queued', 'preparing', 'running')
  and created_by_user_id is null;
