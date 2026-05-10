alter table public.content_drafts
add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table public.video_edit_jobs
add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

update public.content_drafts cd
set created_by_user_id = mp.owner_user_id
from public.merchant_profiles mp
where cd.merchant_id = mp.id
  and cd.created_by_user_id is null
  and mp.owner_user_id is not null;

update public.video_edit_jobs vej
set created_by_user_id = cd.created_by_user_id
from public.content_drafts cd
where vej.draft_id = cd.id
  and vej.created_by_user_id is null
  and cd.created_by_user_id is not null;

create index if not exists idx_content_drafts_merchant_creator_created_at
on public.content_drafts (merchant_id, created_by_user_id, created_at desc);

create index if not exists idx_video_edit_jobs_merchant_creator_created_at
on public.video_edit_jobs (merchant_id, created_by_user_id, created_at desc);

create policy content_drafts_team_member_own_read
on public.content_drafts for select
using (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = content_drafts.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);

create policy content_variants_team_member_own_read
on public.content_variants for select
using (
  exists (
    select 1
    from public.content_drafts cd
    join public.merchant_team_members mtm on mtm.merchant_id = cd.merchant_id
    where cd.id = content_variants.draft_id
      and cd.created_by_user_id = auth.uid()
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);

create policy video_edit_jobs_team_member_own_read
on public.video_edit_jobs for select
using (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = video_edit_jobs.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);
