import Link from "next/link";
import { BriefcaseBusiness, ChevronRight, UserPlus } from "lucide-react";

import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { workspaces } = await requireMemberAccess("/member/teams");

  return (
    <div className="space-y-4 px-4 py-5">
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 text-xs text-[#1f6f68]">
          <BriefcaseBusiness className="size-4" aria-hidden="true" />
          团队选择
        </div>
        <h1 className="mt-3 text-xl font-semibold">选择要进入的团队</h1>
        <p className="mt-2 text-sm leading-7 text-black/60">
          当前账号可以加入多个团队。选择后，内容日历、图文和视频任务都会按该团队读取。
        </p>
      </section>

      {params.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          团队切换失败，请重新选择。
        </div>
      ) : null}

      <section className="space-y-3">
        {workspaces.map((workspace) => (
          <form
            key={workspace.merchantProfile.id}
            action="/api/member/workspaces/select"
            method="post"
            className="rounded-lg border border-black/10 bg-white p-4"
          >
            <input type="hidden" name="merchantId" value={workspace.merchantProfile.id} />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{workspace.merchantProfile.name}</p>
                <p className="mt-1 text-xs text-black/45">
                  {workspace.role === "owner" ? "负责人" : "成员"} · {workspace.merchantProfile.status}
                </p>
              </div>
              <button
                type="submit"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-white"
                aria-label={`进入 ${workspace.merchantProfile.name}`}
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          </form>
        ))}
      </section>

      <Link
        href="/member/invite"
        className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#1f6f68]"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        输入邀请码加入其他团队
      </Link>
    </div>
  );
}
