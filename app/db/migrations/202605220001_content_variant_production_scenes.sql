alter table public.content_variants
add column if not exists production_scenes jsonb not null default '[]'::jsonb;

alter table public.content_variants
drop constraint if exists content_variants_production_scenes_array;

alter table public.content_variants
add constraint content_variants_production_scenes_array
check (jsonb_typeof(production_scenes) = 'array');
