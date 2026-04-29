"use client";

import Link from "next/link";
import { LogIn, LoaderCircle, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MerchantLoginFormProps = {
  initialErrorMessage?: string;
  nextPath: string;
};

const invalidCredentialsMessage = "邮箱或密码不正确，请重新输入。";
const noMerchantProfileMessage =
  "这个账号还没有绑定商户，请使用邀请码注册，或联系平台管理员处理。";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function MerchantLoginForm({
  initialErrorMessage,
  nextPath,
}: MerchantLoginFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setErrorMessage(invalidCredentialsMessage);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        setErrorMessage(invalidCredentialsMessage);
        return;
      }

      const profileResponse = await fetch("/api/merchant-profile", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!profileResponse.ok) {
        const payload = (await profileResponse.json().catch(() => null)) as ApiErrorPayload | null;

        await supabase.auth.signOut();

        if (payload?.error?.code === "MERCHANT_PROFILE_NOT_FOUND") {
          setErrorMessage(noMerchantProfileMessage);
          return;
        }

        setErrorMessage(payload?.error?.message ?? "登录状态建立失败，请刷新后重试。");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("登录失败，请确认网络后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full rounded-[2rem] border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-7">
      <div className="flex items-start gap-4 border-b border-white/10 pb-5">
        <div className="flex size-12 rotate-45 items-center justify-center rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-600 to-amber-200 text-black shadow-[0_0_36px_rgba(245,158,11,0.22)]">
          <Store className="-rotate-45 size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/70">
            Merchant Access
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white [font-family:var(--font-cormorant)]">
            登录商家工作台
          </h1>
          <p className="mt-1 text-sm leading-6 text-white/45">
            使用 owner 邮箱和密码进入咨询诊断、图文工作台和视频工作台。
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2.5">
          <Label htmlFor="email" className="text-white/70">
            邮箱
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20"
            placeholder="owner@example.com"
            autoComplete="username"
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
            className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20"
            autoComplete="current-password"
            required
          />
        </div>

        <Button
          type="submit"
          className="mt-1 h-12 rounded-2xl border border-amber-300/20 bg-amber-600 text-base font-semibold text-white shadow-[0_14px_34px_rgba(180,83,9,0.3)] hover:bg-amber-500"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              登录中
            </>
          ) : (
            <>
              <LogIn className="size-4" aria-hidden="true" />
              登录
            </>
          )}
        </Button>
      </form>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
        <span>还没有商家账号？</span>
        <Link className="font-medium text-amber-200 hover:text-amber-100" href="/register">
          使用邀请码注册
        </Link>
      </div>
    </section>
  );
}
