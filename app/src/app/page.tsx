import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck, UserPlus, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

const entryCards = [
  {
    title: "用户登录",
    description: "已有 owner 账号的用户从这里进入咨询诊断和内容工作台。",
    href: "/login",
    icon: KeyRound,
    primary: true,
  },
  {
    title: "成员端",
    description: "成员用自己的用户名和密码登录，或通过邀请码注册加入团队。",
    href: "/member/login",
    icon: UserPlus,
    primary: false,
  },
  {
    title: "平台管理",
    description: "平台管理员进入邀请码、用户治理、Agent 和知识库配置。",
    href: "/platform-admin-login",
    icon: ShieldCheck,
    primary: false,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 text-white md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center gap-8 py-8">
        <section className="max-w-3xl">
          <div className="mb-5 flex size-12 rotate-45 items-center justify-center rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-600 to-amber-200 text-black shadow-[0_0_36px_rgba(245,158,11,0.22)]">
            <UserRound className="-rotate-45 size-5" aria-hidden="true" />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/70">
            Jingjing Content Platform
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-white [font-family:var(--font-cormorant)] md:text-6xl">
            静境内容获客平台
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/55">
            请选择要进入的身份入口。用户工作台先登录进入，没有账号时可在登录页使用邀请码注册。
          </p>
        </section>

        <section className="grid max-w-5xl gap-4 md:grid-cols-3">
          {entryCards.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-56 flex-col justify-between rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-5 transition hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-[#111111]"
            >
              <div>
                <div
                  className={
                    item.primary
                      ? "flex size-11 items-center justify-center rounded-2xl bg-amber-500 text-black"
                      : "flex size-11 items-center justify-center rounded-2xl bg-white/[0.08] text-white/70"
                  }
                >
                  <item.icon className="size-5" aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-white">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-white/50">{item.description}</p>
              </div>
              <div className="mt-6 flex items-center text-sm font-medium text-amber-200">
                进入
                <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="h-11 rounded-2xl border border-amber-300/20 bg-amber-600 px-5 text-white shadow-[0_14px_34px_rgba(180,83,9,0.25)] hover:bg-amber-500"
            asChild
          >
            <Link href="/login">用户登录</Link>
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-5 text-white/70 hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href="/member/login">成员端</Link>
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-5 text-white/70 hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href="/platform-admin-login">平台管理</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
