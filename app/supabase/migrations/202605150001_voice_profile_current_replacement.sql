create or replace function public.replace_current_voice_profile(
  p_profile_id uuid,
  p_merchant_id uuid,
  p_created_by_user_id uuid,
  p_display_name text,
  p_ref_audio_asset_id uuid,
  p_provider text default 'pixelle_clone'
)
returns public.voice_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.voice_profiles%rowtype;
  v_created public.voice_profiles%rowtype;
begin
  if p_profile_id is null then
    raise exception 'VOICE_PROFILE_ID_REQUIRED' using errcode = 'P0001';
  end if;

  if p_merchant_id is null then
    raise exception 'VOICE_PROFILE_MERCHANT_REQUIRED' using errcode = 'P0001';
  end if;

  if p_created_by_user_id is null then
    raise exception 'VOICE_PROFILE_CREATOR_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_display_name, '')), '') is null then
    raise exception 'VOICE_PROFILE_DISPLAY_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  if char_length(trim(p_display_name)) > 80 then
    raise exception 'VOICE_PROFILE_DISPLAY_NAME_TOO_LONG' using errcode = 'P0001';
  end if;

  if p_provider <> 'pixelle_clone' then
    raise exception 'VOICE_PROFILE_PROVIDER_UNSUPPORTED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.asset_objects ao
    where ao.id = p_ref_audio_asset_id
      and ao.owner_type = 'voice_profile'
      and ao.owner_id = p_profile_id
      and ao.asset_type = 'audio'
      and ao.storage_provider = 'tencent_cos'
  ) then
    raise exception 'VOICE_PROFILE_AUDIO_ASSET_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from public.voice_profiles
  where id = p_profile_id
  for update;

  if found then
    if v_existing.merchant_id <> p_merchant_id
      or v_existing.created_by_user_id <> p_created_by_user_id then
      raise exception 'VOICE_PROFILE_ID_CONFLICT' using errcode = 'P0001';
    end if;

    if v_existing.status = 'ready'
      and v_existing.ref_audio_asset_id = p_ref_audio_asset_id then
      return v_existing;
    end if;

    raise exception 'VOICE_PROFILE_ID_CONFLICT' using errcode = 'P0001';
  end if;

  update public.voice_profiles
  set
    status = 'archived',
    updated_at = now()
  where merchant_id = p_merchant_id
    and created_by_user_id = p_created_by_user_id
    and status = 'ready';

  insert into public.voice_profiles (
    id,
    merchant_id,
    created_by_user_id,
    display_name,
    status,
    provider,
    ref_audio_asset_id,
    authorization_accepted_at
  )
  values (
    p_profile_id,
    p_merchant_id,
    p_created_by_user_id,
    trim(p_display_name),
    'ready',
    p_provider,
    p_ref_audio_asset_id,
    now()
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.replace_current_voice_profile(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text
) from public;

grant execute on function public.replace_current_voice_profile(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text
) to service_role;

create unique index if not exists idx_voice_profiles_one_ready_per_creator
on public.voice_profiles (merchant_id, created_by_user_id)
where status = 'ready';
