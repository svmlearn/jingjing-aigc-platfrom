import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, UserRound } from "lucide-react";

import { getOptionalMemberAccess } from "@/lib/auth/member-page-guard";

const errorMessages: Record<string, string> = {
  "invalid-credentials": "用户名或密码不正确，请重新输入。",
  unauthenticated: "请先登录成员账号，再进入成员端。",
  "no-member-workspace": "这个账号还没有可用团队，请使用邀请码加入团队。",
};

function getSafeNextParam(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  if (!value.startsWith("/member")) {
    return "";
  }

  if (value.startsWith("/member/login") || value.startsWith("/member/register")) {
    return "";
  }

  return value;
}

export default async function MemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const access = await getOptionalMemberAccess();
  if (access?.workspaces.length) {
    redirect(access.workspaces.length > 1 ? "/member/teams" : "/member/calendar");
  }

  const next = getSafeNextParam(params.next);
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="min-h-screen bg-[#ece8dc] px-4 py-6 text-[#171717]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-lg border border-black/10 bg-[#f7f4ea] p-5 shadow-2xl shadow-black/10">
          <div className="flex items-start gap-3 border-b border-black/10 pb-5">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#171717] text-[#f1c15b]">
              <UserRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1f6f68]">
                Member Access
              </p>
              <h1 className="mt-2 text-2xl font-semibold">登录成员端</h1>
              <p className="mt-1 text-sm leading-6 text-black/55">
                用自己的用户名和密码进入内容日历、图文和视频任务。
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form action="/api/auth/member-login" method="post" className="mt-5 grid gap-4">
            <input type="hidden" name="next" value={next} />
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
                autoComplete="current-password"
                required
                className="h-12 rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#1f6f68]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 text-sm font-semibold text-white"
            >
              <LogIn className="size-4" aria-hidden="true" />
              登录成员端
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-sm">
            <span className="text-black/50">还没有成员账号？</span>
            <Link className="font-medium text-[#1f6f68]" href="/member/register">
              使用邀请码注册
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
