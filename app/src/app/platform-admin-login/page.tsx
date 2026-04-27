import { Shield, ShieldAlert, UserPlus } from "lucide-react";
import { redirect } from "next/navigation";

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
  "bootstrap-failed": "首个超管初始化失败，请确认 Supabase Auth 与身份表已经可用。",
  "bootstrap-invalid": "初始化表单内容不完整，邮箱格式或密码长度不符合要求。",
  "bootstrap-secret-required": "首个超管初始化需要先配置 ADMIN_SETUP_SECRET。",
  "disabled-admin": "这个后台管理员账号已被禁用，请联系超级管理员。",
  "invalid-credentials": "邮箱或密码不正确，暂时不能进入平台管理台。",
  "invalid-setup-secret": "初始化口令不正确，不能创建首个超级管理员。",
  "no-admin-access": "这个账号还不是平台后台管理员，请联系超级管理员开通。",
  "not-configured": "当前环境还没有配置 Supabase Auth，管理台入口暂不可用。",
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
  const bootstrapSecretConfigured = isPlatformAdminBootstrapSecretConfigured();
  const hasAdminUsers = accessConfigured ? await hasAnyPlatformAdminUsers() : false;
  const showBootstrap = accessConfigured && !hasAdminUsers;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-10 text-[#17202a]">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border border-[#dde3ea] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#e8f1ff] text-[#1d4ed8]">
              {showBootstrap ? (
                <UserPlus className="size-5" aria-hidden="true" />
              ) : (
                <Shield className="size-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1d4ed8]">Platform Admin</p>
              <h1 className="mt-1 text-2xl font-semibold">
                {showBootstrap ? "初始化首个超级管理员" : "进入平台管理台"}
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#5d6b7a]">
            平台后台现在使用独立管理员账号登录，密码由 Supabase Auth 管理，权限由
            `platform_admin_users` 中的 super_admin / admin 角色决定。
          </p>

          {errorMessage ? (
            <div className="mt-5 rounded-md border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#be123c]">
              {errorMessage}
            </div>
          ) : null}

          {showBootstrap ? (
            <form action={initializePlatformAdmin} className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="setupSecret">初始化口令</Label>
                <Input
                  id="setupSecret"
                  name="setupSecret"
                  type="password"
                  placeholder="输入 ADMIN_SETUP_SECRET"
                  autoComplete="one-time-code"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="displayName">显示名称</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  placeholder="例如：平台超管"
                  autoComplete="name"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  autoComplete="username"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  disabled={!bootstrapSecretConfigured}
                />
              </div>

              <Button
                type="submit"
                className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                disabled={!bootstrapSecretConfigured}
              >
                创建 super_admin 并进入后台
              </Button>
            </form>
          ) : (
            <form action={signInToPlatformAdmin} className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  autoComplete="username"
                  disabled={!accessConfigured}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  disabled={!accessConfigured}
                />
              </div>

              <Button
                type="submit"
                className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                disabled={!accessConfigured}
              >
                登录平台管理台
              </Button>
            </form>
          )}
        </section>

        <aside className="rounded-md border border-[#dde3ea] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 text-[#92400e]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">当前访问规则</h2>
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#5d6b7a]">
                <li>super_admin 拥有系统配置、管理员账号和商户治理等全部权限。</li>
                <li>admin 可查看后台、维护知识、编辑草稿类能力并运行调试。</li>
                <li>disabled 管理员即使 Supabase Auth 仍有效，也不能进入后台或调用后台接口。</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4 text-sm leading-6 text-[#5d6b7a]">
            首个 super_admin 只在管理员表为空时开放初始化；创建完成后，后续管理员统一在「系统配置」里由超级管理员维护。
          </div>
        </aside>
      </div>
    </main>
  );
}
