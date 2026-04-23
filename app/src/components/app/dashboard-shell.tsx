"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePenLine,
  Files,
  Import,
  PanelLeft,
  Store,
  UserRoundPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard/import", label: "导入", icon: Import },
  { href: "/dashboard/content", label: "内容中心", icon: Files },
  { href: "/dashboard/rewrite/source-xhs-sensitive-repair", label: "改写工作台", icon: FilePenLine },
  { href: "/dashboard/drafts/draft-sensitive-repair", label: "草稿", icon: PanelLeft },
  { href: "/dashboard/merchant-profile", label: "商户资料", icon: Store },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#17202a]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[#dde3ea] bg-white lg:flex lg:flex-col">
        <div className="border-b border-[#dde3ea] p-5">
          <Link href="/dashboard/import" className="block focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30">
            <p className="text-sm font-semibold text-[#17202a]">静境内容获客</p>
            <p className="mt-1 text-xs text-[#5d6b7a]">V0.1-A 商家工作台</p>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="工作台主导航">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
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
          <Button asChild variant="outline" className="h-10 w-full justify-start rounded-md">
            <Link href="/register">
              <UserRoundPlus className="size-4" />
              邀请注册演示
            </Link>
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[#dde3ea] bg-white/90 px-4 py-3 backdrop-blur md:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard/import" className="font-semibold text-[#17202a]">
              静境内容获客
            </Link>
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/register">注册演示</Link>
            </Button>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="移动端后台导航">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "min-h-10 shrink-0 rounded-md border border-[#dde3ea] px-3 py-2 text-sm text-[#435364]",
                  (pathname === href || pathname.startsWith(`${href}/`)) &&
                    "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
