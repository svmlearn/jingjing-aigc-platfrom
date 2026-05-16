import { Shield, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthBackButton } from "@/components/app/auth-back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hasAnyPlatformAdminUsers,
  hasPlatformAdminSession,
  isPlatformAdminAccessConfigured,
  isPlatformAdminBootstrapSecretConfigured,
} from "@/lib/auth/platform-admin-session";

import { initializePlatformAdmin, signInToPlatformAdmin } from "./actions";

const errorMessages: Record<string, string> = {
  "bootstrap-exists": "当前环境已经存在后台管理员，请直接用账号密码登录。",
  "bootstrap-failed": "首个超管初始化失败，请确认平台管理身份表与初始化参数已经可用。",
  "bootstrap-invalid": "初始化表单内容不完整，邮箱格式或密码长度不符合要求。",
  "bootstrap-secret-required": "首个超管初始化需要先配置 ADMIN_SETUP_SECRET。",
  "disabled-admin": "这个后台管理员账号已被禁用，请联系超级管理员。",
  "invalid-credentials": "邮箱或密码不正确，暂时不能进入平台管理台。",
  "invalid-setup-secret": "初始化口令不正确，不能创建首个超级管理员。",
  "no-admin-access": "这个账号还不是平台后台管理员，请联系超级管理员开通。",
  "not-configured": "当前环境还没有配置平台管理登录能力，管理台入口暂不可用。",
};

export default async function PlatformAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  if (await hasPlatformAdminSession()) {
    redirect("/platform-admin");
  }

  const params = await searchParams;
  const accessConfigured = isPlatformAdminAccessConfigured();
  const bootstrapSecretConfigured = isPlatformAdminBootstrapSecretConfigured();
  const hasAdminUsers = accessConfigured ? await hasAnyPlatformAdminUsers() : false;
  const showBootstrap = accessConfigured && !hasAdminUsers;
  const showBootstrapForm = showBootstrap && params.mode === "bootstrap";
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="relative min-h-screen bg-[#050505] px-4 py-6 text-white md:px-6">
      <AuthBackButton />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center justify-center py-10">
        <section className="w-full rounded-[2rem] border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-7">
          <div className="flex items-start gap-4 border-b border-white/10 pb-5">
            <div className="flex size-12 rotate-45 items-center justify-center rounded-2xl border border-sky-200/30 bg-gradient-to-br from-sky-700 to-sky-200 text-black shadow-[0_0_36px_rgba(56,189,248,0.18)]">
              {showBootstrap ? (
                showBootstrapForm ? (
                  <UserPlus className="-rotate-45 size-5" aria-hidden="true" />
                ) : (
                  <Shield className="-rotate-45 size-5" aria-hidden="true" />
                )
              ) : (
                <Shield className="-rotate-45 size-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-sky-200/75">
                Platform Admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white [font-family:var(--font-cormorant)]">
                {showBootstrapForm ? "初始化首个超级管理员" : "进入平台管理台"}
              </h1>
              <p className="mt-1 text-sm leading-6 text-white/45">
                使用平台管理员邮箱和密码登录。
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {showBootstrap && !showBootstrapForm ? (
            <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-100">
              当前环境还没有平台管理员账号。首次部署初始化请由部署负责人创建第一个 super_admin。
              <div className="mt-3">
                <Link className="font-semibold text-sky-200 hover:text-sky-100" href="/platform-admin-login?mode=bootstrap">
                  打开首次初始化入口
                </Link>
              </div>
            </div>
          ) : null}

          {showBootstrapForm ? (
            <form action={initializePlatformAdmin} className="mt-6 grid gap-5">
              <div className="grid gap-2.5">
                <Label htmlFor="setupSecret" className="text-white/70">
                  初始化口令
                </Label>
                <Input
                  id="setupSecret"
                  name="setupSecret"
                  type="password"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  placeholder="输入 ADMIN_SETUP_SECRET"
                  autoComplete="one-time-code"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2.5">
                <Label htmlFor="displayName" className="text-white/70">
                  显示名称
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  placeholder="例如：平台超管"
                  autoComplete="name"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2.5">
                <Label htmlFor="email" className="text-white/70">
                  邮箱
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  placeholder="admin@example.com"
                  autoComplete="username"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2.5">
                <Label htmlFor="password" className="text-white/70">
                  密码
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  minLength={8}
                  autoComplete="new-password"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>

              <Button
                type="submit"
                className="mt-1 h-12 rounded-2xl border border-sky-300/20 bg-sky-700 text-base font-semibold text-white shadow-[0_14px_34px_rgba(3,105,161,0.28)] hover:bg-sky-600"
                disabled={!bootstrapSecretConfigured}
              >
                创建 super_admin 并进入后台
              </Button>
              <Link className="text-center text-sm font-medium text-sky-200 hover:text-sky-100" href="/platform-admin-login">
                返回账号密码登录
              </Link>
            </form>
          ) : (
            <form action={signInToPlatformAdmin} className="mt-6 grid gap-5">
              <div className="grid gap-2.5">
                <Label htmlFor="email" className="text-white/70">
                  邮箱
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  placeholder="admin@example.com"
                  autoComplete="username"
                  disabled={!accessConfigured}
                  required
                />
              </div>
              <div className="grid gap-2.5">
                <Label htmlFor="password" className="text-white/70">
                  密码
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
                  autoComplete="current-password"
                  disabled={!accessConfigured}
                  required
                />
              </div>

              <Button
                type="submit"
                className="mt-1 h-12 rounded-2xl border border-sky-300/20 bg-sky-700 text-base font-semibold text-white shadow-[0_14px_34px_rgba(3,105,161,0.28)] hover:bg-sky-600"
                disabled={!accessConfigured}
              >
                登录平台管理台
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
