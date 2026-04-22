"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files, LayoutDashboard, LogOut, Settings, Store, TicketPlus } from "lucide-react";

import { signOutFromPlatformAdmin } from "@/app/platform-admin-login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/platform-admin", label: "总览", icon: LayoutDashboard },
  { href: "/platform-admin/invitation-codes", label: "邀请码管理", icon: TicketPlus },
  { href: "/platform-admin/merchants", label: "商户管理", icon: Store },
  { href: "/platform-admin/settings", label: "系统配置", icon: Settings },
];

export function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNavItemActive = (href: string) =>
    href === "/platform-admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#17202a]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[#dde3ea] bg-white lg:flex lg:flex-col">
        <div className="border-b border-[#dde3ea] p-5">
          <Link href="/platform-admin" className="block focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30">
            <p className="text-sm font-semibold text-[#17202a]">静境平台管理台</p>
            <p className="mt-1 text-xs text-[#5d6b7a]">内部演示 / 平台配置与商户治理</p>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="平台管理台主导航">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#435364] transition-colors hover:bg-[#edf4ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30",
                  active && "bg-[#e8f1ff] text-[#1d4ed8]"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="grid gap-2 border-t border-[#dde3ea] p-4">
          <form action={signOutFromPlatformAdmin}>
            <Button type="submit" variant="outline" className="h-10 w-full justify-start rounded-md">
              <LogOut className="size-4" />
              退出平台管理台
            </Button>
          </form>
          <Button asChild variant="outline" className="h-10 w-full justify-start rounded-md">
            <Link href="/dashboard/import">
              <Files className="size-4" />
              返回商家工作台
            </Link>
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[#dde3ea] bg-white/90 px-4 py-3 backdrop-blur md:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/platform-admin" className="font-semibold text-[#17202a]">
              静境平台管理台
            </Link>
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/dashboard/import">商家工作台</Link>
            </Button>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="移动端平台管理导航">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "min-h-10 shrink-0 rounded-md border border-[#dde3ea] px-3 py-2 text-sm text-[#435364]",
                  isNavItemActive(href) &&
                    "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <form action={signOutFromPlatformAdmin} className="mt-3">
            <Button type="submit" variant="outline" className="rounded-md">
              退出平台管理台
            </Button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
