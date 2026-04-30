"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  Bot,
  Bug,
  Files,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  Store,
  Ticket,
  Zap,
} from "lucide-react";

import { signOutFromPlatformAdmin } from "@/app/platform-admin-login/actions";
import type { PlatformAdminUserDto } from "@/contracts/platform-admin";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "运营管理",
    items: [
      { href: "/platform-admin", label: "总览", icon: LayoutDashboard },
      { href: "/platform-admin/invitation-codes", label: "邀请码管理", icon: Ticket },
      { href: "/platform-admin/merchants", label: "商户管理", icon: Store },
      { href: "/platform-admin/knowledge", label: "方法论知识库", icon: BookOpenText },
    ],
  },
  {
    label: "Agent 能力",
    items: [
      { href: "/platform-admin/agents", label: "Agent 配置", icon: Bot },
      { href: "/platform-admin/skills", label: "技能管理", icon: Zap },
      { href: "/platform-admin/debug", label: "Agent 调试", icon: Bug },
    ],
  },
  {
    label: "系统",
    items: [{ href: "/platform-admin/settings", label: "系统配置", icon: Settings }],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

export function PlatformAdminShell({
  children,
  currentAdmin,
}: {
  children: React.ReactNode;
  currentAdmin: PlatformAdminUserDto;
}) {
  const pathname = usePathname();
  const isNavItemActive = (href: string) =>
    href === "/platform-admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#050505] lg:flex lg:flex-col">
        <div className="border-b border-white/[0.06] px-5 py-5">
          <Link
            href="/platform-admin"
            className="group block rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-500/20"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">静境平台管理台</p>
                <p className="mt-1 truncate text-[11px] text-white/35">
                  Agent Console · Admin
                </p>
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="平台管理台主导航">
          {navGroups.map((group) => (
            <div key={group.label} className="grid gap-1">
              <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-white/28">
                {group.label}
              </div>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavItemActive(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-md border border-transparent px-3 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-500/15",
                      active &&
                        "border-amber-500/20 bg-amber-500/10 text-amber-300 shadow-[inset_2px_0_0_rgba(245,158,11,0.65)]",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="grid gap-2 border-t border-white/[0.06] p-4">
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="truncate text-sm font-medium text-white/80">
              {currentAdmin.displayName || currentAdmin.email}
            </p>
            <p className="mt-1 truncate text-xs text-amber-300/75">{currentAdmin.role}</p>
          </div>
          <Link
            href="/dashboard/import"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/10"
          >
            <Files className="size-4" aria-hidden="true" />
            <span className="truncate">返回商家工作台</span>
          </Link>
          <form action={signOutFromPlatformAdmin}>
            <button
              type="submit"
              className="inline-flex min-h-10 w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/10"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="truncate">退出平台管理台</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href="/platform-admin" className="block truncate font-semibold text-white">
                静境平台管理台
              </Link>
              <p className="mt-1 truncate text-xs text-white/35">
                {currentAdmin.displayName || currentAdmin.email} · {currentAdmin.role}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/dashboard/import"
                className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/60"
              >
                商家工作台
              </Link>
              <form action={signOutFromPlatformAdmin}>
                <button
                  type="submit"
                  className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/60"
                >
                  退出
                </button>
              </form>
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="移动端平台管理导航">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = isNavItemActive(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55",
                    active && "border-amber-500/30 bg-amber-500/10 text-amber-300",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="min-h-screen w-full px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
