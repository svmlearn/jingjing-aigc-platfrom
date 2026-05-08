"use client";

import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type {
  RegisterWithInviteRequest,
  RegisterWithInviteResponse,
} from "@/contracts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const registrationErrorMessages: Record<string, string> = {
  INVITATION_CODE_NOT_FOUND: "邀请码不存在，请检查后再试。",
  INVITATION_CODE_EXPIRED: "邀请码已经过期，请联系平台重新生成。",
  INVITATION_CODE_UNAVAILABLE: "邀请码已不可用，可能已用完或已被停用。",
  MERCHANT_NAME_REQUIRED: "请先填写展示名称，再继续创建账号。",
  MERCHANT_OWNER_EXISTS: "这个账号已经绑定过用户信息，不能重复注册。",
  AUTH_USER_CREATE_FAILED: "账号创建失败，邮箱可能已经被使用。",
};

function getRegistrationErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "注册失败，请稍后再试。";
  }

  const error = "error" in payload ? payload.error : undefined;

  if (!error || typeof error !== "object") {
    return "注册失败，请稍后再试。";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  if (code && registrationErrorMessages[code]) {
    return registrationErrorMessages[code];
  }

  return message ?? "注册失败，请稍后再试。";
}

export function RegistrationFlow() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const inviteCode = String(form.get("inviteCode") ?? "").trim();
    const merchantName = String(form.get("merchantName") ?? "").trim();

    if (!merchantName) {
      setErrorMessage("请先填写展示名称，邀请码注册至少要先创建用户信息。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);

    try {
      const payload: RegisterWithInviteRequest = {
        email,
        password,
        inviteCode,
        merchantProfile: {
          name: merchantName,
        },
      };

      const response = await fetch("/api/auth/register-with-invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | RegisterWithInviteResponse
        | { error?: { code?: string; message?: string } }
        | null;

      if (!response.ok) {
        setErrorMessage(getRegistrationErrorMessage(data));
        return;
      }

      if (!data || !("sessionEstablished" in data) || !data.sessionEstablished) {
        setErrorMessage("账号已创建，但当前自动登录没有成功，请稍后重试。");
        return;
      }

      setSuccessMessage("账号和用户信息已创建，正在进入资料补全页。");
      router.push("/merchant/onboarding");
      router.refresh();
    } catch {
      setErrorMessage("注册失败，请确认网络后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full rounded-[2rem] border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] backdrop-blur sm:p-7">
      <div className="flex items-start gap-4 border-b border-white/10 pb-5">
        <div className="flex size-12 rotate-45 items-center justify-center rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-600 to-amber-200 text-black shadow-[0_0_36px_rgba(245,158,11,0.22)]">
          <div className="-rotate-45">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/70">
            User Access
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white [font-family:var(--font-cormorant)]">
            邀请码注册
          </h2>
          <p className="mt-1 text-sm leading-6 text-white/45">
            创建 owner 账号后，将直接进入用户信息补全。
          </p>
        </div>
      </div>

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2.5">
          <Label htmlFor="merchantName" className="text-white/70">
            展示名称
          </Label>
          <Input
            id="merchantName"
            name="merchantName"
            className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20"
            placeholder="例如：young"
            required
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
            className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20"
            placeholder="owner@example.com"
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
            placeholder="至少 8 位"
            minLength={8}
            required
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="inviteCode" className="text-white/70">
            邀请码
          </Label>
          <Input
            id="inviteCode"
            name="inviteCode"
            className="h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20"
            placeholder="JJ-2026-001"
            required
          />
        </div>

        {errorMessage ? (
          <p className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-200" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          className="mt-1 h-12 rounded-2xl border border-amber-300/20 bg-amber-600 text-base font-semibold text-white shadow-[0_14px_34px_rgba(180,83,9,0.3)] hover:bg-amber-500"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              创建中
            </>
          ) : (
            "创建 owner 账号"
          )}
        </Button>
      </form>
    </section>
  );
}
