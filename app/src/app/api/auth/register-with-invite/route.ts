import {
  createDomesticPasswordHash,
  isDomesticSessionEnabled,
  signInDomesticUser,
} from "@/lib/auth/domestic-session";
import { redeemInvitationCode } from "@/lib/db/merchant-repository";
import { queryAppDb } from "@/lib/server-db/postgres";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";
import { ApiError, handleApiError } from "@/server/api/errors";
import { registerWithInviteSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function mapOwnerRegistrationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("duplicate key")) {
    return new ApiError(409, "AUTH_USER_CREATE_FAILED", "This email is already registered.");
  }

  if (error instanceof ApiError) {
    if (
      error.code === "INVITATION_CODE_NOT_ACTIVE" ||
      error.code === "INVITATION_CODE_REDEEMED" ||
      error.code === "INVITATION_CODE_PURPOSE_INVALID"
    ) {
      return new ApiError(
        error.status === 400 ? 400 : 409,
        "INVITATION_CODE_UNAVAILABLE",
        "Invitation code is unavailable.",
      );
    }

    return error;
  }

  return error;
}

async function createDomesticOwnerUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}) {
  try {
    const result = await queryAppDb<{ id: string }>(
      `
      insert into public.app_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, $3, 'merchant_owner', 'active')
      returning id
      `,
      [input.email, createDomesticPasswordHash(input.password), input.displayName || null],
    );

    const userId = result.rows[0]?.id;
    if (!userId) {
      throw new ApiError(500, "AUTH_USER_CREATE_FAILED", "Failed to create user.");
    }

    return userId;
  } catch (error) {
    throw mapOwnerRegistrationError(error);
  }
}

async function deleteDomesticOwnerUser(userId: string) {
  await queryAppDb(
    `
    delete from public.app_users
    where id = $1 and role = 'merchant_owner'
    `,
    [userId],
  ).catch(() => undefined);
}

export async function POST(request: Request) {
  let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;
  let createdUserId: string | undefined;
  let merchantRedeemed = false;

  try {
    const payload = registerWithInviteSchema.parse(await request.json());
    const email = payload.email.trim().toLowerCase();

    if (isDomesticSessionEnabled()) {
      createdUserId = await createDomesticOwnerUser({
        email,
        password: payload.password,
        displayName: payload.merchantProfile.contactName ?? payload.merchantProfile.name,
      });

      const merchantProfile = await redeemInvitationCode({
        code: payload.inviteCode,
        ownerUserId: createdUserId,
        merchantProfile: payload.merchantProfile,
      });
      merchantRedeemed = true;

      const user = await signInDomesticUser({ email, password: payload.password });

      return Response.json(
        {
          userId: user.id,
          merchantProfile,
          sessionEstablished: true,
        },
        { status: 201 },
      );
    }

    if (!isSupabasePublicConfigured() || !isSupabaseAdminConfigured()) {
      throw new ApiError(
        503,
        "AUTH_SERVICE_NOT_CONFIGURED",
        "Merchant registration service is not configured.",
      );
    }

    supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new ApiError(
        error?.status ?? 500,
        "AUTH_USER_CREATE_FAILED",
        error?.message ?? "Failed to create user.",
      );
    }

    createdUserId = data.user.id;

    const merchantProfile = await redeemInvitationCode({
      code: payload.inviteCode,
      ownerUserId: data.user.id,
      merchantProfile: payload.merchantProfile,
    });
    merchantRedeemed = true;

    const supabaseServer = await createSupabaseServerClient();
    const { error: signInError } = await supabaseServer.auth.signInWithPassword({
      email,
      password: payload.password,
    });

    return Response.json(
      {
        userId: data.user.id,
        merchantProfile,
        sessionEstablished: !signInError,
      },
      { status: 201 },
    );
  } catch (error) {
    if (createdUserId && !merchantRedeemed && supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    } else if (createdUserId && !merchantRedeemed && isDomesticSessionEnabled()) {
      await deleteDomesticOwnerUser(createdUserId);
    }

    return handleApiError(mapOwnerRegistrationError(error));
  }
}
