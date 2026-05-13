import "server-only";

import { randomBytes } from "node:crypto";

import type { ContentDraftBundleDto, ContentDraftDto, ContentVariantDto } from "@/contracts/draft";
import type { Platform } from "@/contracts/import";
import type {
  InvitationCodeDto,
  MemberInvitationAcceptResultDto,
  MerchantPlan,
  MerchantProfileDto,
  MerchantProfileInput,
  MerchantTeamRole,
  MerchantWorkspaceDto,
} from "@/contracts/merchant";
import type {
  MediaAssetDto,
  MediaAssetType,
  MediaOwnerType,
  MediaStorageProvider,
} from "@/contracts/media";
import type {
  CreateVideoEditJobRequest,
  VideoEditJobDto,
  VideoEditJobStatus,
  VideoEditJobTriggerSource,
} from "@/contracts/video";
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

type Timestamp = string | Date;

type MerchantProfileRow = {
  id: string;
  owner_user_id: string | null;
  name: string;
  industry: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  service_items: unknown;
  brand_summary: string | null;
  region_summary: string | null;
  tone_style: string | null;
  default_cta: unknown;
  forbidden_words: unknown;
  status: "active" | "disabled" | "archived";
  plan: MerchantPlan;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type InvitationCodeRow = {
  id: string;
  code: string;
  purpose: "merchant_signup";
  status: "active" | "redeemed" | "expired" | "disabled";
  max_redemptions: number;
  redemption_count: number;
  expires_at: Timestamp | null;
  note: string | null;
  created_at: Timestamp;
};

type MerchantTeamMemberRow = {
  id: string;
  merchant_id: string;
  user_id: string;
  role: MerchantTeamRole;
  status: "active" | "disabled";
  display_name: string | null;
  invited_by_user_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type MerchantTeamInvitationCodeRow = {
  id: string;
  merchant_id: string;
  code: string;
  status: "active" | "disabled" | "expired";
  max_redemptions: number;
  redemption_count: number;
  expires_at: Timestamp | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ContentDraftRow = {
  id: string;
  source_item_id: string;
  merchant_id: string;
  created_by_user_id: string | null;
  working_title: string | null;
  rewrite_goal: string | null;
  input_snapshot: Record<string, unknown> | null;
  status: ContentDraftDto["status"];
  selected_variant_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ContentVariantRow = {
  id: string;
  draft_id: string;
  platform: Platform;
  variant_type: ContentVariantDto["variantType"];
  version_no: number;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  hashtags: unknown;
  cta_text: string | null;
  review_status: ContentVariantDto["reviewStatus"];
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ContentVariantAccessRow = ContentVariantRow & {
  draft_merchant_id: string;
  draft_created_by_user_id: string | null;
  draft_input_snapshot: Record<string, unknown> | null;
};

type AssetObjectRow = {
  id: string;
  owner_type: MediaOwnerType;
  owner_id: string;
  asset_type: MediaAssetType;
  storage_provider: MediaStorageProvider;
  bucket_name: string | null;
  storage_key: string;
  origin_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | string | null;
  etag: string | null;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp | null;
};

type VideoEditJobRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string | null;
  draft_id: string;
  content_variant_id: string;
  status: VideoEditJobStatus;
  current_stage: string | null;
  trigger_source: VideoEditJobTriggerSource;
  instruction_text: string | null;
  input_payload: Record<string, unknown> | null;
  runtime_payload: Record<string, unknown> | null;
  progress_pct: number;
  retry_count: number;
  failure_reason: string | null;
  result_payload: Record<string, unknown> | null;
  log_payload: Record<string, unknown> | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type MediaOwnerContext = {
  ownerType: MediaOwnerType;
  ownerId: string;
  merchantId: string;
  createdByUserId?: string | null;
  draftId?: string;
  variantType?: ContentVariantDto["variantType"];
};

export function isPostgresVideoChainEnabled() {
  return isAppPostgresPreferred() && isAppPostgresConfigured();
}

export async function pgCreateInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
}): Promise<InvitationCodeDto> {
  const code = input.code?.trim() || generateInvitationCode();
  const result = await queryAppDb<InvitationCodeRow>(
    `
    insert into public.invitation_codes (
      code,
      max_redemptions,
      expires_at,
      note
    ) values ($1, $2, $3, $4)
    returning ${invitationCodeSelect}
    `,
    [code, input.maxRedemptions ?? 1, input.expiresAt ?? null, input.note ?? null],
  );

  return mapInvitationCode(result.rows[0]);
}

export async function pgRedeemInvitationCode(input: {
  code: string;
  ownerUserId: string;
  merchantProfile: MerchantProfileInput;
}): Promise<MerchantProfileDto> {
  const merchantId = await withAppDbTransaction(async (client) => {
    const codeResult = await client.query<{
      id: string;
      purpose: string;
      status: string;
      max_redemptions: number;
      redemption_count: number;
      expires_at: Timestamp | null;
    }>(
      `
      select id, purpose, status, max_redemptions, redemption_count, expires_at
      from public.invitation_codes
      where code = $1
      for update
      `,
      [input.code.trim()],
    );
    const invitation = codeResult.rows[0];

    assertMerchantInviteUsable(invitation);

    const profile = input.merchantProfile;
    const merchantResult = await client.query<{ id: string }>(
      `
      insert into public.merchant_profiles (
        owner_user_id,
        name,
        industry,
        contact_name,
        contact_phone,
        address,
        service_items,
        brand_summary,
        region_summary,
        tone_style,
        default_cta,
        forbidden_words
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12::jsonb)
      returning id
      `,
      [
        input.ownerUserId,
        profile.name,
        profile.industry ?? null,
        profile.contactName ?? null,
        profile.contactPhone ?? null,
        profile.address ?? null,
        JSON.stringify(profile.serviceItems ?? []),
        profile.brandSummary ?? null,
        profile.regionSummary ?? null,
        profile.toneStyle ?? null,
        JSON.stringify(profile.defaultCta ?? []),
        JSON.stringify(profile.forbiddenWords ?? []),
      ],
    );
    const createdMerchantId = merchantResult.rows[0].id;

    await client.query(
      `
      update public.invitation_codes
      set redemption_count = redemption_count + 1,
          redeemed_by_user_id = $2,
          redeemed_merchant_id = $3,
          status = case
            when redemption_count + 1 >= max_redemptions then 'redeemed'
            else status
          end,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [invitation.id, input.ownerUserId, createdMerchantId],
    );
    await client.query(
      `
      insert into public.merchant_team_members (
        merchant_id,
        user_id,
        role,
        status,
        display_name
      ) values ($1, $2, 'owner', 'active', $3)
      on conflict (user_id) do update set
        merchant_id = excluded.merchant_id,
        role = 'owner',
        status = 'active',
        display_name = excluded.display_name,
        updated_at = timezone('utc', now())
      `,
      [createdMerchantId, input.ownerUserId, profile.name],
    );

    return createdMerchantId;
  });

  return pgGetMerchantProfileById(merchantId);
}

export async function pgGetMerchantProfileById(id: string): Promise<MerchantProfileDto> {
  const result = await queryAppDb<MerchantProfileRow>(
    `
    select ${merchantProfileSelect}
    from public.merchant_profiles
    where id = $1
    limit 1
    `,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }
  return mapMerchantProfile(row);
}

export async function pgGetMerchantProfileByOwnerUserId(
  ownerUserId: string,
): Promise<MerchantProfileDto> {
  const result = await queryAppDb<MerchantProfileRow>(
    `
    select ${merchantProfileSelect}
    from public.merchant_profiles
    where owner_user_id = $1
    limit 1
    `,
    [ownerUserId],
  );
  const row = result.rows[0];
  if (row) {
    return mapMerchantProfile(row);
  }

  const membership = await pgGetActiveMerchantTeamMemberByUserId(ownerUserId);
  if (membership) {
    return pgGetMerchantProfileById(membership.merchant_id);
  }

  throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
}

export async function pgGetMerchantWorkspaceByUserId(
  userId: string,
): Promise<MerchantWorkspaceDto> {
  const owner = await queryAppDb<MerchantProfileRow>(
    `
    select ${merchantProfileSelect}
    from public.merchant_profiles
    where owner_user_id = $1
    limit 1
    `,
    [userId],
  );

  if (owner.rows[0]) {
    const membership = await pgEnsureMerchantOwnerMembership({
      merchantId: owner.rows[0].id,
      userId,
      displayName: owner.rows[0].name,
    });

    return {
      merchantProfile: mapMerchantProfile(owner.rows[0]),
      role: "owner",
      membershipId: membership?.id ?? null,
    };
  }

  const membership = await pgGetActiveMerchantTeamMemberByUserId(userId);
  if (!membership) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return {
    merchantProfile: await pgGetMerchantProfileById(membership.merchant_id),
    role: membership.role,
    membershipId: membership.id,
  };
}

export async function pgAcceptMemberInvitationCode(input: {
  code: string;
  userId: string;
  displayName?: string | null;
}): Promise<MemberInvitationAcceptResultDto> {
  const normalizedCode = normalizeMemberInvitationCode(input.code);
  if (!normalizedCode) {
    throw new ApiError(400, "MEMBER_INVITATION_CODE_REQUIRED", "Member invitation code is required.");
  }

  await withAppDbTransaction(async (client) => {
    const invitationResult = await client.query<MerchantTeamInvitationCodeRow>(
      `
      select ${merchantTeamInvitationCodeSelect}
      from public.merchant_team_invitation_codes
      where code = $1
      for update
      `,
      [normalizedCode],
    );
    const invitation = invitationResult.rows[0] ?? null;
    assertMemberInvitationUsable(invitation);

    await client.query(
      `
      insert into public.merchant_team_members (
        merchant_id,
        user_id,
        role,
        status,
        display_name,
        invited_by_user_id
      ) values ($1, $2, 'member', 'active', $3, $4)
      on conflict (user_id) do update set
        merchant_id = excluded.merchant_id,
        role = 'member',
        status = 'active',
        display_name = excluded.display_name,
        invited_by_user_id = excluded.invited_by_user_id,
        updated_at = timezone('utc', now())
      `,
      [
        invitation.merchant_id,
        input.userId,
        input.displayName ?? null,
        invitation.created_by_user_id,
      ],
    );
    await client.query(
      `
      update public.merchant_team_invitation_codes
      set redemption_count = redemption_count + 1,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [invitation.id],
    );
  });

  return {
    ...(await pgGetMerchantWorkspaceByUserId(input.userId)),
    invitationCode: normalizedCode,
  };
}

export async function pgUpdateMerchantProfile(
  ownerUserId: string,
  input: Partial<MerchantProfileInput>,
): Promise<MerchantProfileDto> {
  const updates: Array<[string, unknown]> = [];
  if (input.name !== undefined) updates.push(["name", input.name]);
  if (input.industry !== undefined) updates.push(["industry", input.industry]);
  if (input.contactName !== undefined) updates.push(["contact_name", input.contactName]);
  if (input.contactPhone !== undefined) updates.push(["contact_phone", input.contactPhone]);
  if (input.address !== undefined) updates.push(["address", input.address]);
  if (input.serviceItems !== undefined) updates.push(["service_items", JSON.stringify(input.serviceItems)]);
  if (input.brandSummary !== undefined) updates.push(["brand_summary", input.brandSummary]);
  if (input.regionSummary !== undefined) updates.push(["region_summary", input.regionSummary]);
  if (input.toneStyle !== undefined) updates.push(["tone_style", input.toneStyle]);
  if (input.defaultCta !== undefined) updates.push(["default_cta", JSON.stringify(input.defaultCta)]);
  if (input.forbiddenWords !== undefined) {
    updates.push(["forbidden_words", JSON.stringify(input.forbiddenWords)]);
  }

  if (updates.length === 0) {
    return pgGetMerchantProfileByOwnerUserId(ownerUserId);
  }

  const values = updates.map(([, value]) => value);
  const assignments = updates
    .map(([column], index) =>
      ["service_items", "default_cta", "forbidden_words"].includes(column)
        ? `${column} = $${index + 1}::jsonb`
        : `${column} = $${index + 1}`,
    )
    .join(", ");
  const result = await queryAppDb<MerchantProfileRow>(
    `
    update public.merchant_profiles
    set ${assignments},
        updated_at = timezone('utc', now())
    where owner_user_id = $${values.length + 1}
    returning ${merchantProfileSelect}
    `,
    [...values, ownerUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }
  return mapMerchantProfile(row);
}

export async function pgCreateManualSourceItem(input: {
  merchantId: string;
  platform: Platform;
  title: string;
  bodyText?: string | null;
  scriptText?: string | null;
  tracePayload?: Record<string, unknown>;
}) {
  const result = await queryAppDb<{ id: string }>(
    `
    insert into public.source_items (
      merchant_id,
      platform,
      source_type,
      title,
      body_text,
      script_text,
      trace_payload
    ) values ($1, $2, 'manual_text', $3, $4, $5, $6::jsonb)
    returning id
    `,
    [
      input.merchantId,
      input.platform,
      input.title,
      input.bodyText ?? null,
      input.scriptText ?? null,
      JSON.stringify(input.tracePayload ?? {}),
    ],
  );

  return { id: result.rows[0].id };
}

export async function pgCreateDraftWithVariants(input: {
  merchantId: string;
  createdByUserId?: string | null;
  sourceItemId: string;
  workingTitle: string;
  rewriteGoal?: string | null;
  inputSnapshot?: Record<string, unknown>;
  commentInsights?: Record<string, unknown>;
  status?: ContentDraftDto["status"];
  variants: Array<{
    platform: Platform;
    variantType: ContentVariantDto["variantType"];
    title?: string | null;
    bodyText?: string | null;
    scriptText?: string | null;
    hashtags?: string[];
    ctaText?: string | null;
    productionScenes?: ContentVariantDto["productionScenes"];
    reviewStatus?: ContentVariantDto["reviewStatus"];
  }>;
}): Promise<ContentDraftBundleDto> {
  return withAppDbTransaction(async (client) => {
    const draftResult = await client.query<ContentDraftRow>(
      `
      insert into public.content_drafts (
        source_item_id,
        merchant_id,
        created_by_user_id,
        working_title,
        rewrite_goal,
        input_snapshot,
        comment_insights,
        status
      ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      returning ${contentDraftSelect}
      `,
      [
        input.sourceItemId,
        input.merchantId,
        input.createdByUserId ?? null,
        input.workingTitle,
        input.rewriteGoal ?? null,
        JSON.stringify(input.inputSnapshot ?? {}),
        JSON.stringify(input.commentInsights ?? {}),
        input.status ?? "review_pending",
      ],
    );
    const draft = mapContentDraft(draftResult.rows[0]);
    const variants: ContentVariantDto[] = [];

    for (const [index, variant] of input.variants.entries()) {
      const variantResult = await client.query<ContentVariantRow>(
        `
        insert into public.content_variants (
          draft_id,
          platform,
          variant_type,
          version_no,
          title,
          body_text,
          script_text,
          hashtags,
          cta_text,
          review_status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        returning ${contentVariantSelect}
        `,
        [
          draft.id,
          variant.platform,
          variant.variantType,
          index + 1,
          variant.title ?? null,
          variant.bodyText ?? null,
          variant.scriptText ?? null,
          JSON.stringify(variant.hashtags ?? []),
          variant.ctaText ?? null,
          variant.reviewStatus ?? "editing",
        ],
      );
      variants.push(mapContentVariant(variantResult.rows[0]));
    }

    const selectedVariant = variants[0] ?? null;
    if (selectedVariant) {
      const updatedDraft = await client.query<ContentDraftRow>(
        `
        update public.content_drafts
        set selected_variant_id = $2,
            updated_at = timezone('utc', now())
        where id = $1
        returning ${contentDraftSelect}
        `,
        [draft.id, selectedVariant.id],
      );

      return {
        draft: mapContentDraft(updatedDraft.rows[0]),
        variants,
        selectedVariant,
      };
    }

    return { draft, variants, selectedVariant };
  });
}

export async function pgListDraftBundlesByMerchant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  limit?: number;
}): Promise<ContentDraftBundleDto[]> {
  const params: unknown[] = [input.merchantId, input.limit ?? 50];
  const creatorSql = input.createdByUserId ? "and created_by_user_id = $3" : "";
  if (input.createdByUserId) {
    params.push(input.createdByUserId);
  }
  const draftResult = await queryAppDb<ContentDraftRow>(
    `
    select ${contentDraftSelect}
    from public.content_drafts
    where merchant_id = $1
    ${creatorSql}
    order by created_at desc
    limit $2
    `,
    params,
  );
  const drafts = draftResult.rows.map(mapContentDraft);
  if (drafts.length === 0) {
    return [];
  }

  const variantResult = await queryAppDb<ContentVariantRow>(
    `
    select ${contentVariantSelect}
    from public.content_variants
    where draft_id = any($1::uuid[])
    order by version_no asc
    `,
    [drafts.map((draft) => draft.id)],
  );
  return mapDraftBundles(drafts, variantResult.rows.map(mapContentVariant));
}

export async function pgGetDraftBundleByMerchant(input: {
  merchantId: string;
  draftId: string;
  createdByUserId?: string | null;
}): Promise<ContentDraftBundleDto> {
  const params: unknown[] = [input.draftId, input.merchantId];
  const creatorSql = input.createdByUserId ? "and created_by_user_id = $3" : "";
  if (input.createdByUserId) {
    params.push(input.createdByUserId);
  }
  const draftResult = await queryAppDb<ContentDraftRow>(
    `
    select ${contentDraftSelect}
    from public.content_drafts
    where id = $1 and merchant_id = $2
    ${creatorSql}
    limit 1
    `,
    params,
  );
  const draft = draftResult.rows[0];
  if (!draft) {
    throw new ApiError(404, "CONTENT_DRAFT_NOT_FOUND", "Content draft not found.");
  }

  const variantResult = await queryAppDb<ContentVariantRow>(
    `
    select ${contentVariantSelect}
    from public.content_variants
    where draft_id = $1
    order by version_no asc
    `,
    [input.draftId],
  );

  return mapDraftBundles([mapContentDraft(draft)], variantResult.rows.map(mapContentVariant))[0];
}

export async function pgApproveContentVariant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}): Promise<ContentVariantDto> {
  const currentVariant = await pgAssertContentVariantAccess(input);
  return withAppDbTransaction(async (client) => {
    const variantResult = await client.query<ContentVariantRow>(
      `
      update public.content_variants
      set review_status = 'approved',
          updated_at = timezone('utc', now())
      where id = $1
      returning ${contentVariantSelect}
      `,
      [input.contentVariantId],
    );
    await client.query(
      `
      update public.content_drafts
      set selected_variant_id = $2,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [currentVariant.draftId, input.contentVariantId],
    );
    return mapContentVariant(variantResult.rows[0]);
  });
}

export async function pgAppendContentVariantToDraft(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  platform: Platform;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  bodyText?: string | null;
  scriptText?: string | null;
  hashtags?: string[];
  ctaText?: string | null;
  productionScenes?: ContentVariantDto["productionScenes"];
  reviewStatus?: ContentVariantDto["reviewStatus"];
}): Promise<ContentVariantDto> {
  await pgGetDraftBundleByMerchant({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    draftId: input.draftId,
  });
  return withAppDbTransaction(async (client) => {
    const nextVersionResult = await client.query<{ version_no: number }>(
      `
      select coalesce(max(version_no), 0) + 1 as version_no
      from public.content_variants
      where draft_id = $1
      `,
      [input.draftId],
    );
    const variantResult = await client.query<ContentVariantRow>(
      `
      insert into public.content_variants (
        draft_id,
        platform,
        variant_type,
        version_no,
        title,
        body_text,
        script_text,
        hashtags,
        cta_text,
        review_status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      returning ${contentVariantSelect}
      `,
      [
        input.draftId,
        input.platform,
        input.variantType,
        Number(nextVersionResult.rows[0]?.version_no ?? 1),
        input.title ?? null,
        input.bodyText ?? null,
        input.scriptText ?? null,
        JSON.stringify(input.hashtags ?? []),
        input.ctaText ?? null,
        input.reviewStatus ?? "review_pending",
      ],
    );
    const variant = mapContentVariant(variantResult.rows[0]);
    await client.query(
      `
      update public.content_drafts
      set selected_variant_id = $2,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [input.draftId, variant.id],
    );
    return variant;
  });
}

export async function pgUpdateContentVariantScript(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
  title?: string | null;
  scriptText: string;
  hashtags?: string[];
  ctaText?: string | null;
  reviewStatus?: ContentVariantDto["reviewStatus"];
}): Promise<ContentVariantDto> {
  const currentVariant = await pgAssertContentVariantAccess({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    contentVariantId: input.contentVariantId,
    variantType: "video_script",
  });

  return withAppDbTransaction(async (client) => {
    const variantResult = await client.query<ContentVariantRow>(
      `
      update public.content_variants
      set title = $2,
          script_text = $3,
          hashtags = $4::jsonb,
          cta_text = $5,
          review_status = $6,
          updated_at = timezone('utc', now())
      where id = $1
      returning ${contentVariantSelect}
      `,
      [
        input.contentVariantId,
        input.title ?? currentVariant.title ?? null,
        input.scriptText,
        JSON.stringify(input.hashtags ?? currentVariant.hashtags),
        input.ctaText ?? currentVariant.ctaText ?? null,
        input.reviewStatus ?? "review_pending",
      ],
    );
    await client.query(
      `
      update public.content_drafts
      set selected_variant_id = $2,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [currentVariant.draftId, input.contentVariantId],
    );
    return mapContentVariant(variantResult.rows[0]);
  });
}

export async function pgAssertContentVariantAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
  variantType?: ContentVariantDto["variantType"];
}) {
  const result = await queryAppDb<ContentVariantAccessRow>(
    `
    select
      ${contentVariantSelect
        .split(", ")
        .map((column) => `cv.${column}`)
        .join(", ")},
      cd.merchant_id as draft_merchant_id,
      cd.created_by_user_id as draft_created_by_user_id,
      cd.input_snapshot as draft_input_snapshot
    from public.content_variants cv
    join public.content_drafts cd on cd.id = cv.draft_id
    where cv.id = $1
    limit 1
    `,
    [input.contentVariantId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.draft_merchant_id !== input.merchantId ||
    (input.createdByUserId && row.draft_created_by_user_id !== input.createdByUserId)
  ) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant is not accessible.");
  }
  const variant = mapContentVariant(row);
  if (input.variantType && variant.variantType !== input.variantType) {
    throw new ApiError(
      409,
      "CONTENT_VARIANT_TYPE_MISMATCH",
      "当前内容版本类型和操作要求不一致。",
    );
  }

  return {
    merchantId: row.draft_merchant_id,
    createdByUserId: row.draft_created_by_user_id ?? null,
    draftId: variant.draftId,
    contentVariantId: variant.id,
    variantType: variant.variantType,
    title: variant.title,
    bodyText: variant.bodyText,
    scriptText: variant.scriptText,
    hashtags: variant.hashtags,
    ctaText: variant.ctaText,
    reviewStatus: variant.reviewStatus,
    inputSnapshot: row.draft_input_snapshot ?? null,
  };
}

export async function pgAppendContentDraftRevisionTrace(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  trace: Record<string, unknown>;
}) {
  const bundle = await pgGetDraftBundleByMerchant(input);
  const snapshot = bundle.draft.inputSnapshot ?? {};
  const traces = Array.isArray(snapshot.revisionTraces) ? snapshot.revisionTraces : [];
  const snapshotParam = input.createdByUserId ? "$4" : "$3";
  await queryAppDb(
    `
    update public.content_drafts
    set input_snapshot = ${snapshotParam}::jsonb,
        updated_at = timezone('utc', now())
    where id = $1 and merchant_id = $2
    ${input.createdByUserId ? "and created_by_user_id = $3" : ""}
    `,
    input.createdByUserId
      ? [
          input.draftId,
          input.merchantId,
          input.createdByUserId,
          JSON.stringify({ ...snapshot, revisionTraces: [...traces, input.trace] }),
        ]
      : [
          input.draftId,
          input.merchantId,
          JSON.stringify({ ...snapshot, revisionTraces: [...traces, input.trace] }),
        ],
  );
}

export async function pgAssertMediaOwnerAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaOwnerContext> {
  if (input.ownerType === "source_item") {
    const result = await queryAppDb<{ id: string; merchant_id: string }>(
      `
      select id, merchant_id
      from public.source_items
      where id = $1 and merchant_id = $2
      limit 1
      `,
      [input.ownerId, input.merchantId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Source item not found.");
    }

    return { ownerType: input.ownerType, ownerId: row.id, merchantId: row.merchant_id };
  }

  if (input.ownerType === "content_draft") {
    const params: unknown[] = [input.ownerId, input.merchantId];
    const creatorSql = input.createdByUserId ? "and created_by_user_id = $3" : "";
    if (input.createdByUserId) {
      params.push(input.createdByUserId);
    }
    const result = await queryAppDb<{
      id: string;
      merchant_id: string;
      created_by_user_id: string | null;
    }>(
      `
      select id, merchant_id, created_by_user_id
      from public.content_drafts
      where id = $1 and merchant_id = $2
      ${creatorSql}
      limit 1
      `,
      params,
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Content draft not found.");
    }

    return {
      ownerType: input.ownerType,
      ownerId: row.id,
      merchantId: row.merchant_id,
      createdByUserId: row.created_by_user_id,
      draftId: row.id,
    };
  }

  const variant = await pgAssertContentVariantAccess({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    contentVariantId: input.ownerId,
  });
  return {
    ownerType: input.ownerType,
    ownerId: variant.contentVariantId,
    merchantId: variant.merchantId,
    createdByUserId: variant.createdByUserId,
    draftId: variant.draftId,
    variantType: variant.variantType,
  };
}

export async function pgCreateAssetObject(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  originUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder?: number;
}): Promise<MediaAssetDto> {
  const sortOrder =
    input.sortOrder ??
    Number(
      (
        await queryAppDb<{ sort_order: number }>(
          `
          select coalesce(max(sort_order), -1) + 1 as sort_order
          from public.asset_objects
          where owner_type = $1 and owner_id = $2
          `,
          [input.ownerType, input.ownerId],
        )
      ).rows[0]?.sort_order ?? 0,
    );
  const result = await queryAppDb<AssetObjectRow>(
    `
    insert into public.asset_objects (
      owner_type,
      owner_id,
      asset_type,
      storage_provider,
      bucket_name,
      storage_key,
      origin_url,
      mime_type,
      file_size_bytes,
      etag,
      sort_order
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    returning ${assetObjectSelect}
    `,
    [
      input.ownerType,
      input.ownerId,
      input.assetType,
      input.storageProvider,
      input.bucketName ?? null,
      input.storageKey,
      input.originUrl ?? null,
      input.mimeType ?? null,
      input.fileSizeBytes ?? null,
      input.etag ?? null,
      sortOrder,
    ],
  );

  return mapAssetObject(result.rows[0]);
}

export async function pgListAssetObjectsByOwner(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaAssetDto[]> {
  const result = await queryAppDb<AssetObjectRow>(
    `
    select ${assetObjectSelect}
    from public.asset_objects
    where owner_type = $1 and owner_id = $2
    order by sort_order asc, created_at asc
    `,
    [input.ownerType, input.ownerId],
  );

  return result.rows.map(mapAssetObject);
}

export async function pgAssertVideoScriptVariantAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}) {
  const variant = await pgAssertContentVariantAccess({
    ...input,
    variantType: "video_script",
  });

  return variant;
}

export async function pgCreateVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  triggerSource?: VideoEditJobTriggerSource;
  instructionText?: CreateVideoEditJobRequest["instructionText"];
  inputPayload?: CreateVideoEditJobRequest["inputPayload"];
  runtimePayload?: Record<string, unknown>;
}): Promise<VideoEditJobDto> {
  const result = await queryAppDb<VideoEditJobRow>(
    `
    insert into public.video_edit_jobs (
      merchant_id,
      created_by_user_id,
      draft_id,
      content_variant_id,
      trigger_source,
      instruction_text,
      input_payload,
      runtime_payload,
      result_payload,
      log_payload,
      progress_pct,
      retry_count,
      status,
      current_stage,
      failure_reason,
      started_at,
      finished_at
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 'pending', null, null, null, null)
    returning ${videoEditJobSelect}
    `,
    [
      input.merchantId,
      input.createdByUserId ?? null,
      input.draftId,
      input.contentVariantId,
      input.triggerSource ?? "manual",
      input.instructionText ?? null,
      JSON.stringify(input.inputPayload ?? {}),
      JSON.stringify(input.runtimePayload ?? {}),
    ],
  );

  return mapVideoEditJob(result.rows[0]);
}

export async function pgListVideoEditJobs(
  merchantId: string,
  filters: {
    status?: VideoEditJobStatus;
    createdByUserId?: string | null;
    limit?: number;
  } = {},
): Promise<VideoEditJobDto[]> {
  const params: unknown[] = [merchantId, filters.limit ?? 50];
  const statusSql = filters.status ? `and status = $${params.length + 1}` : "";
  if (filters.status) params.push(filters.status);
  const creatorSql = filters.createdByUserId ? `and created_by_user_id = $${params.length + 1}` : "";
  if (filters.createdByUserId) params.push(filters.createdByUserId);
  const result = await queryAppDb<VideoEditJobRow>(
    `
    select ${videoEditJobSelect}
    from public.video_edit_jobs
    where merchant_id = $1
    ${statusSql}
    ${creatorSql}
    order by created_at desc
    limit $2
    `,
    params,
  );

  return result.rows.map(mapVideoEditJob);
}

export async function pgGetVideoEditJobById(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const params: unknown[] = [input.jobId, input.merchantId];
  const creatorSql = input.createdByUserId ? "and created_by_user_id = $3" : "";
  if (input.createdByUserId) params.push(input.createdByUserId);
  const result = await queryAppDb<VideoEditJobRow>(
    `
    select ${videoEditJobSelect}
    from public.video_edit_jobs
    where id = $1 and merchant_id = $2
    ${creatorSql}
    limit 1
    `,
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }
  return mapVideoEditJob(row);
}

export async function pgRetryVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const current = await pgGetVideoEditJobById(input);
  if (current.status !== "failed_retryable") {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_RETRY_NOT_ALLOWED",
      "Only failed_retryable jobs can be retried.",
    );
  }
  const params: unknown[] = [input.jobId, input.merchantId, current.retryCount + 1];
  const creatorSql = input.createdByUserId ? "and created_by_user_id = $4" : "";
  if (input.createdByUserId) params.push(input.createdByUserId);
  const result = await queryAppDb<VideoEditJobRow>(
    `
    update public.video_edit_jobs
    set status = 'pending',
        current_stage = null,
        progress_pct = 0,
        failure_reason = null,
        runtime_payload = '{}'::jsonb,
        result_payload = '{}'::jsonb,
        log_payload = '{}'::jsonb,
        started_at = null,
        finished_at = null,
        claimed_at = null,
        heartbeat_at = null,
        worker_id = null,
        timeout_at = null,
        retry_count = $3,
        updated_at = timezone('utc', now())
    where id = $1 and merchant_id = $2
    ${creatorSql}
    returning ${videoEditJobSelect}
    `,
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_RETRY_FAILED", "Retry failed.");
  }
  return mapVideoEditJob(row);
}

export async function pgCancelVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const current = await pgGetVideoEditJobById(input);
  if (!["pending", "queued", "preparing", "running"].includes(current.status)) {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_CANCEL_NOT_ALLOWED",
      "Only in-flight jobs can be cancelled.",
    );
  }
  const params: unknown[] = [input.jobId, input.merchantId, current.currentStage ?? "cancelled"];
  const creatorSql = input.createdByUserId ? "and created_by_user_id = $4" : "";
  if (input.createdByUserId) params.push(input.createdByUserId);
  const result = await queryAppDb<VideoEditJobRow>(
    `
    update public.video_edit_jobs
    set status = 'cancelled',
        current_stage = $3,
        finished_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = $1 and merchant_id = $2
    ${creatorSql}
    returning ${videoEditJobSelect}
    `,
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_CANCEL_FAILED", "Cancel failed.");
  }
  return mapVideoEditJob(row);
}

async function pgGetActiveMerchantTeamMemberByUserId(userId: string) {
  const result = await queryAppDb<MerchantTeamMemberRow>(
    `
    select ${merchantTeamMemberSelect}
    from public.merchant_team_members
    where user_id = $1 and status = 'active'
    limit 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function pgEnsureMerchantOwnerMembership(input: {
  merchantId: string;
  userId: string;
  displayName?: string | null;
}) {
  const result = await queryAppDb<MerchantTeamMemberRow>(
    `
    insert into public.merchant_team_members (
      merchant_id,
      user_id,
      role,
      status,
      display_name
    ) values ($1, $2, 'owner', 'active', $3)
    on conflict (user_id) do update set
      merchant_id = excluded.merchant_id,
      role = 'owner',
      status = 'active',
      display_name = excluded.display_name,
      updated_at = timezone('utc', now())
    returning ${merchantTeamMemberSelect}
    `,
    [input.merchantId, input.userId, input.displayName ?? null],
  );

  return result.rows[0] ?? null;
}

function assertMerchantInviteUsable(
  invitation:
    | {
        id: string;
        purpose: string;
        status: string;
        max_redemptions: number;
        redemption_count: number;
        expires_at: Timestamp | null;
      }
    | undefined,
) {
  if (!invitation) {
    throw new ApiError(404, "INVITATION_CODE_NOT_FOUND", "Invitation code not found.");
  }
  if (invitation.purpose !== "merchant_signup") {
    throw new ApiError(400, "INVITATION_CODE_PURPOSE_INVALID", "Invitation code purpose is invalid.");
  }
  if (invitation.status !== "active") {
    throw new ApiError(409, "INVITATION_CODE_NOT_ACTIVE", "Invitation code is not active.");
  }
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new ApiError(409, "INVITATION_CODE_EXPIRED", "Invitation code has expired.");
  }
  if (invitation.redemption_count >= invitation.max_redemptions) {
    throw new ApiError(409, "INVITATION_CODE_REDEEMED", "Invitation code has been redeemed.");
  }
}

function assertMemberInvitationUsable(invitation: MerchantTeamInvitationCodeRow | null) {
  if (!invitation) {
    throw new ApiError(404, "MEMBER_INVITATION_CODE_NOT_FOUND", "Member invitation code not found.");
  }
  if (invitation.status !== "active") {
    throw new ApiError(409, "MEMBER_INVITATION_CODE_NOT_ACTIVE", "Member invitation code is not active.");
  }
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new ApiError(409, "MEMBER_INVITATION_CODE_EXPIRED", "Member invitation code has expired.");
  }
  if (invitation.redemption_count >= invitation.max_redemptions) {
    throw new ApiError(409, "MEMBER_INVITATION_CODE_REDEEMED", "Member invitation code has been redeemed.");
  }
}

function mapDraftBundles(
  drafts: ContentDraftDto[],
  variants: ContentVariantDto[],
): ContentDraftBundleDto[] {
  const groupedVariants = new Map<string, ContentVariantDto[]>();
  for (const variant of variants) {
    const current = groupedVariants.get(variant.draftId) ?? [];
    current.push(variant);
    groupedVariants.set(variant.draftId, current);
  }

  return drafts.map((draft) => {
    const draftVariants = groupedVariants.get(draft.id) ?? [];
    return {
      draft,
      variants: draftVariants,
      selectedVariant:
        draftVariants.find((variant) => variant.id === draft.selectedVariantId) ??
        draftVariants[0] ??
        null,
    };
  });
}

function mapMerchantProfile(row: MerchantProfileRow): MerchantProfileDto {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    industry: row.industry,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    address: row.address,
    serviceItems: toStringArray(row.service_items),
    brandSummary: row.brand_summary,
    regionSummary: row.region_summary,
    toneStyle: row.tone_style,
    defaultCta: toStringArray(row.default_cta),
    forbiddenWords: toStringArray(row.forbidden_words),
    status: row.status,
    plan: row.plan,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapInvitationCode(row: InvitationCodeRow): InvitationCodeDto {
  return {
    id: row.id,
    code: row.code,
    purpose: row.purpose,
    status: row.status,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
    note: row.note,
    createdAt: toIsoString(row.created_at),
  };
}

function mapContentDraft(row: ContentDraftRow): ContentDraftDto {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id ?? null,
    workingTitle: row.working_title,
    rewriteGoal: row.rewrite_goal,
    inputSnapshot: row.input_snapshot ?? null,
    status: row.status,
    selectedVariantId: row.selected_variant_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapContentVariant(row: ContentVariantRow): ContentVariantDto {
  return {
    id: row.id,
    draftId: row.draft_id,
    platform: row.platform,
    variantType: row.variant_type,
    versionNo: row.version_no,
    title: row.title,
    bodyText: row.body_text,
    scriptText: row.script_text,
    hashtags: toStringArray(row.hashtags),
    ctaText: row.cta_text,
    productionScenes: [],
    reviewStatus: row.review_status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAssetObject(row: AssetObjectRow): MediaAssetDto {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    assetType: row.asset_type,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    originUrl: row.origin_url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
    etag: row.etag,
    sortOrder: row.sort_order,
    createdAt: toIsoString(row.created_at),
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
  };
}

function mapVideoEditJob(row: VideoEditJobRow): VideoEditJobDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id ?? null,
    draftId: row.draft_id,
    contentVariantId: row.content_variant_id,
    status: row.status,
    currentStage: row.current_stage,
    triggerSource: row.trigger_source,
    instructionText: row.instruction_text,
    inputPayload: row.input_payload ?? {},
    runtimePayload: row.runtime_payload ?? {},
    progressPct: row.progress_pct,
    retryCount: row.retry_count,
    failureReason: row.failure_reason,
    resultPayload: row.result_payload ?? {},
    logPayload: row.log_payload ?? {},
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizeMemberInvitationCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateInvitationCode() {
  return `JJ-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}

const merchantProfileSelect = [
  "id",
  "owner_user_id",
  "name",
  "industry",
  "contact_name",
  "contact_phone",
  "address",
  "service_items",
  "brand_summary",
  "region_summary",
  "tone_style",
  "default_cta",
  "forbidden_words",
  "status",
  "plan",
  "created_at",
  "updated_at",
].join(", ");

const invitationCodeSelect = [
  "id",
  "code",
  "purpose",
  "status",
  "max_redemptions",
  "redemption_count",
  "expires_at",
  "note",
  "created_at",
].join(", ");

const merchantTeamMemberSelect = [
  "id",
  "merchant_id",
  "user_id",
  "role",
  "status",
  "display_name",
  "invited_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

const merchantTeamInvitationCodeSelect = [
  "id",
  "merchant_id",
  "code",
  "status",
  "max_redemptions",
  "redemption_count",
  "expires_at",
  "note",
  "created_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

const contentDraftSelect = [
  "id",
  "source_item_id",
  "merchant_id",
  "created_by_user_id",
  "working_title",
  "rewrite_goal",
  "input_snapshot",
  "status",
  "selected_variant_id",
  "created_at",
  "updated_at",
].join(", ");

const contentVariantSelect = [
  "id",
  "draft_id",
  "platform",
  "variant_type",
  "version_no",
  "title",
  "body_text",
  "script_text",
  "hashtags",
  "cta_text",
  "review_status",
  "created_at",
  "updated_at",
].join(", ");

const assetObjectSelect = [
  "id",
  "owner_type",
  "owner_id",
  "asset_type",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "origin_url",
  "mime_type",
  "file_size_bytes",
  "etag",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

const videoEditJobSelect = [
  "id",
  "merchant_id",
  "created_by_user_id",
  "draft_id",
  "content_variant_id",
  "status",
  "current_stage",
  "trigger_source",
  "instruction_text",
  "input_payload",
  "runtime_payload",
  "progress_pct",
  "retry_count",
  "failure_reason",
  "result_payload",
  "log_payload",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
].join(", ");
