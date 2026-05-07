"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  FolderGit2,
  Library,
  LogOut,
  MessageSquare,
  Settings,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "咨询诊断", icon: MessageSquare },
  { href: "/dashboard/article", label: "图文工作台", icon: FileText },
  { href: "/dashboard/video", label: "视频工作台", icon: Video },
  { href: "/dashboard/content", label: "素材中心", icon: Library },
  { href: "/dashboard/history", label: "我的内容", icon: FolderGit2 },
  { href: "/dashboard/settings", label: "用户信息", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="hidden h-screen overflow-hidden lg:flex">
        <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a]">
          <div className="flex h-16 items-center gap-4 border-b border-white/10 px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-tr from-amber-600 to-amber-200 rotate-45">
              <span className="-rotate-45 text-xs font-bold tracking-tight text-black">AI</span>
            </div>
            <div>
              <p className="text-lg italic tracking-tight [font-family:var(--font-cormorant)]">
                AI 咨询工作台
              </p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                User Workspace
              </p>
            </div>
          </div>
          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => {
              const active =
                pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                    active
                      ? "bg-white/5 text-white"
                      : "text-white/55 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      active ? "bg-amber-500" : "bg-transparent group-hover:bg-white/15",
                    )}
                  />
                  <item.icon className="h-4 w-4 text-white/45" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 p-4">
            <div className="grid gap-2">
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs">
                  我
                </div>
                <div>
                  <p className="text-sm">用户账号</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Owner</p>
                </div>
              </Link>
              <form action="/logout" method="post" className="flex">
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                >
                  <LogOut className="size-3.5" aria-hidden="true" />
                  退出登录
                </button>
              </form>
            </div>
          </div>
        </aside>
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden p-6 lg:p-10">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d0d] shadow-[0_24px_120px_rgba(0,0,0,0.45)]">
            {children}
          </div>
        </main>
      </div>

      <div className="lg:hidden">
        <header className="border-b border-white/10 bg-[#0a0a0a] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg italic tracking-tight [font-family:var(--font-cormorant)]">
              AI 咨询工作台
            </p>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/45"
                aria-label="退出登录"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </form>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-2 text-xs",
                    active
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                      : "border-white/10 bg-white/5 text-white/60",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="p-4">
          <div className="min-h-[calc(100vh-8rem)] overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0d]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
