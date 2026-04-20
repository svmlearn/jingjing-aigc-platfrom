import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redeemInvitationCode } from "@/lib/db/merchant-repository";
import { ApiError, handleApiError } from "@/server/api/errors";
import { registerWithInviteSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;
  let createdUserId: string | undefined;
  let merchantRedeemed = false;

  try {
    supabaseAdmin = createSupabaseAdminClient();
    const payload = registerWithInviteSchema.parse(await request.json());
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
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
      email: payload.email,
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
    }

    return handleApiError(error);
  }
}
