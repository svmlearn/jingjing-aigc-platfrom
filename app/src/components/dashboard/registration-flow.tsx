"use client";

import Link from "next/link";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegistrationFlow() {
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inviteCode = String(form.get("inviteCode") ?? "");

    setStatus(inviteCode.trim().toUpperCase().startsWith("JJ-") ? "success" : "error");
  }

  return (
    <section className="order-1 rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm lg:order-2">
      <div className="flex items-center gap-3 border-b border-[#dde3ea] pb-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-[#e8f1ff] text-[#1d4ed8]">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">邀请码注册</h2>
          <p className="text-sm text-[#5d6b7a]">演示码格式：JJ-2026-001</p>
        </div>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" name="email" type="email" placeholder="owner@example.com" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">密码</Label>
          <Input id="password" name="password" type="password" placeholder="至少 8 位" minLength={8} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inviteCode">邀请码</Label>
          <Input id="inviteCode" name="inviteCode" placeholder="JJ-2026-001" required />
        </div>

        {status === "error" ? (
          <p className="rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">
            邀请码无效或已过期，请检查后再试。
          </p>
        ) : null}

        {status === "success" ? (
          <div className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-3 text-sm text-[#166534]">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4" aria-hidden="true" />
              <p>账号已创建，商户 owner 已就绪。下一步补全商户资料。</p>
            </div>
            <Button className="mt-3 h-10 rounded-md bg-[#166534] text-white hover:bg-[#14532d]" asChild>
              <Link href="/merchant/onboarding">继续补全商户资料</Link>
            </Button>
          </div>
        ) : null}

        <Button type="submit" className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
          创建 owner 账号
        </Button>
      </form>

      <div className="mt-5 grid gap-3 border-t border-[#dde3ea] pt-4 text-sm text-[#5d6b7a] sm:grid-cols-2">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 text-[#0f766e]" aria-hidden="true" />
          密钥不进入浏览器
        </div>
        <div className="flex gap-2">
          <Mail className="mt-0.5 size-4 text-[#0f766e]" aria-hidden="true" />
          一个商户一个 owner
        </div>
      </div>
    </section>
  );
}
