"use client";

import { CheckCircle2, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
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
  MERCHANT_NAME_REQUIRED: "请先填写商户名称，再继续创建账号。",
  MERCHANT_OWNER_EXISTS: "这个账号已经绑定过商户，不能重复注册。",
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
      setErrorMessage("请先填写商户名称，邀请码注册至少要先创建商户主体。");
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

      setSuccessMessage("账号和商户已创建，正在进入资料补全页。");
      router.push("/merchant/onboarding");
      router.refresh();
    } catch {
      setErrorMessage("注册失败，请确认网络后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="order-1 rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm lg:order-2">
      <div className="flex items-center gap-3 border-b border-[#dde3ea] pb-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-[#e8f1ff] text-[#1d4ed8]">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">邀请码注册</h2>
          <p className="text-sm text-[#5d6b7a]">先创建 owner 账号，再进入商户资料补全。</p>
        </div>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="merchantName">商户名称</Label>
          <Input id="merchantName" name="merchantName" placeholder="例如：静境测试门店" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" name="email" type="email" placeholder="owner@example.com" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="至少 8 位"
            minLength={8}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inviteCode">邀请码</Label>
          <Input id="inviteCode" name="inviteCode" placeholder="JJ-2026-001" required />
        </div>

        {errorMessage ? (
          <p className="rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <div className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-3 text-sm text-[#166534]">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
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

      <div className="mt-5 grid gap-3 border-t border-[#dde3ea] pt-4 text-sm text-[#5d6b7a] sm:grid-cols-2">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 text-[#0f766e]" aria-hidden="true" />
          注册会真实校验邀请码
        </div>
        <div className="flex gap-2">
          <Mail className="mt-0.5 size-4 text-[#0f766e]" aria-hidden="true" />
          成功后直接进入资料补全
        </div>
      </div>
    </section>
  );
}
