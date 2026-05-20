import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { getOptionalMemberAccess } from "@/lib/auth/member-page-guard";

const errorMessages: Record<string, string> = {
  invalid_type: "请完整填写注册信息。",
  member_username_exists: "这个用户名已经存在，请直接登录。",
  invitation_code_not_found: "邀请码不存在，请检查后重试。",
  invitation_code_unavailable: "邀请码不可用，请联系团队负责人。",
  invitation_code_expired: "邀请码已过期，请联系团队负责人重新生成。",
  member_invitation_code_required: "请输入团队邀请码。",
  member_invitation_code_not_found: "邀请码不存在，请检查后重试。",
  member_invitation_code_unavailable: "邀请码不可用，请联系团队负责人。",
  member_invitation_lookup_failed: "邀请码校验失败，请稍后重试。",
  invalid_member_registration: "请检查邀请码、用户名和密码，确认两次密码一致。",
  member_register_failed: "注册失败，请稍后重试。",
};

export default async function MemberRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const params = await searchParams;
  const access = await getOptionalMemberAccess();
  if (access?.workspaces.length) {
    redirect(access.workspaces.length > 1 ? "/member/teams" : "/member/calendar");
  }

  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="min-h-screen bg-[#ece8dc] px-4 py-6 text-[#171717]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-lg border border-black/10 bg-[#f7f4ea] p-5 shadow-2xl shadow-black/10">
          <div className="flex items-start gap-3 border-b border-black/10 pb-5">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#171717] text-[#f1c15b]">
              <UserPlus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1f6f68]">
                Join Team
              </p>
              <h1 className="mt-2 text-2xl font-semibold">用邀请码注册</h1>
              <p className="mt-1 text-sm leading-6 text-black/55">
                用户名可以填邮箱或手机号，前期不需要验证码。
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form action="/api/auth/member-register-with-invite" method="post" className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              邀请码
              <input
                name="inviteCode"
                type="text"
                defaultValue={params.code ?? ""}
                placeholder="例如 DEMO-MEMBER"
                required
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm uppercase outline-none focus:border-[#1f6f68]"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              昵称
              <input
                name="displayName"
                type="text"
                placeholder="团队内展示名"
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#1f6f68]"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              用户名
              <input
                name="username"
                type="text"
                autoComplete="username"
                placeholder="邮箱或手机号"
                required
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#1f6f68]"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              密码
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#1f6f68]"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              确认密码
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#1f6f68]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 text-sm font-semibold text-white"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              注册并进入成员端
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-sm">
            <span className="text-black/50">已有成员账号？</span>
            <Link className="font-medium text-[#1f6f68]" href="/member/login">
              去登录
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
