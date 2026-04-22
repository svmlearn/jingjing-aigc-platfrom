import { Shield, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hasPlatformAdminSession,
  isPlatformAdminAccessConfigured,
} from "@/lib/auth/platform-admin-session";

import { signInToPlatformAdmin } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-secret": "口令不正确，暂时不能进入平台管理台。",
  "not-configured": "当前环境还没有配置 ADMIN_SETUP_SECRET，管理台入口暂不可用。",
};

export default async function PlatformAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasPlatformAdminSession()) {
    redirect("/platform-admin");
  }

  const params = await searchParams;
  const accessConfigured = isPlatformAdminAccessConfigured();
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-10 text-[#17202a]">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border border-[#dde3ea] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#e8f1ff] text-[#1d4ed8]">
              <Shield className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1d4ed8]">Platform Admin</p>
              <h1 className="mt-1 text-2xl font-semibold">进入平台管理台</h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#5d6b7a]">
            这不是商家工作台入口。当前先用 `ADMIN_SETUP_SECRET` 做 demo 级守门，避免平台配置页和商户治理页直接暴露。
          </p>

          {errorMessage ? (
            <div className="mt-5 rounded-md border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#be123c]">
              {errorMessage}
            </div>
          ) : null}

          <form action={signInToPlatformAdmin} className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="secret">管理口令</Label>
              <Input
                id="secret"
                name="secret"
                type="password"
                placeholder="输入 ADMIN_SETUP_SECRET"
                autoComplete="current-password"
                disabled={!accessConfigured}
              />
            </div>

            <Button
              type="submit"
              className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              disabled={!accessConfigured}
            >
              验证并进入平台管理台
            </Button>
          </form>
        </section>

        <aside className="rounded-md border border-[#dde3ea] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 text-[#92400e]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">当前访问规则</h2>
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#5d6b7a]">
                <li>平台管理台页面不再从商家工作台直接暴露。</li>
                <li>当前会话只用于内部演示，不替代正式平台管理员账号体系。</li>
                <li>当前登录会同时保护管理台页面和管理台内的接口调用，但还不是正式账号体系。</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4 text-sm leading-6 text-[#5d6b7a]">
            后续如果要进入正式版本，建议把这里替换成独立的 `platform_admin_users + session + RBAC`，而不是长期依赖共享口令。
          </div>
        </aside>
      </div>
    </main>
  );
}
