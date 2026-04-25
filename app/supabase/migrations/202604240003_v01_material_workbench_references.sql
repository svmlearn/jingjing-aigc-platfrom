create table if not exists public.material_workbench_references (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  material_item_id uuid not null references public.source_items(id) on delete cascade,
  target_workbench text not null,
  status text not null default 'pending',
  created_by_user_id uuid references auth.users(id) on delete set null,
  draft_id uuid references public.content_drafts(id) on delete set null,
  trace_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  check (target_workbench in ('article', 'video')),
  check (status in ('pending', 'consumed'))
);

create index if not exists idx_material_workbench_refs_merchant_created_at
on public.material_workbench_references (merchant_id, created_at desc);

create index if not exists idx_material_workbench_refs_material_status
on public.material_workbench_references (material_item_id, status, created_at desc);

create index if not exists idx_material_workbench_refs_draft_id
on public.material_workbench_references (draft_id)
where draft_id is not null;

alter table public.material_workbench_references enable row level security;

drop policy if exists material_workbench_refs_owner_read on public.material_workbench_references;

create policy material_workbench_refs_owner_read
on public.material_workbench_references for select
using (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
);
