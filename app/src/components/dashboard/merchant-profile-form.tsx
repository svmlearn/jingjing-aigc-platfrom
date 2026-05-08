"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle, UserRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { MerchantProfileDto } from "@/contracts/merchant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MerchantProfileResponse = {
  merchantProfile: MerchantProfileDto;
};

type MerchantProfileFormValues = {
  name: string;
  servicesText: string;
};

function toServicesText(serviceItems: string[]) {
  return serviceItems.join("\n");
}

function toServiceItems(value: string) {
  return value
    .split(/\r?\n|,|，/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMerchantProfileErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const error = "error" in payload ? payload.error : undefined;

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  return message ?? fallback;
}

const labelClassName = "text-white/70";
const inputClassName =
  "h-12 rounded-2xl border-white/10 bg-[#050505] px-4 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20 disabled:bg-white/5 disabled:text-white/50";
const textareaClassName =
  "min-h-40 rounded-2xl border-white/10 bg-[#050505] px-4 py-3 text-white placeholder:text-white/25 focus-visible:border-amber-400/50 focus-visible:ring-amber-500/20 disabled:bg-white/5 disabled:text-white/50";

export function MerchantProfileForm({
  title,
  description,
  nextHref,
  nextLabel,
}: {
  title: string;
  description: string;
  nextHref: string;
  nextLabel: string;
}) {
  const [values, setValues] = useState<MerchantProfileFormValues>({
    name: "",
    servicesText: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadMerchantProfile() {
      try {
        const response = await fetch("/api/merchant-profile");
        const payload = (await response.json().catch(() => null)) as
          | MerchantProfileResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !payload || !("merchantProfile" in payload)) {
          if (active) {
            setLoadError(
              getMerchantProfileErrorMessage(payload, "当前还没有拿到用户信息，请先完成邀请码注册。"),
            );
            setLoaded(true);
          }
          return;
        }

        if (!active) {
          return;
        }

        setValues({
          name: payload.merchantProfile.name ?? "",
          servicesText: toServicesText(payload.merchantProfile.serviceItems),
        });
        setLoaded(true);
      } catch {
        if (active) {
          setLoadError("用户信息加载失败，请稍后重试。");
          setLoaded(true);
        }
      }
    }

    loadMerchantProfile();

    return () => {
      active = false;
    };
  }, []);

  function updateValue<Key extends keyof MerchantProfileFormValues>(
    key: Key,
    value: MerchantProfileFormValues[Key],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage(undefined);
    setLoadError(undefined);

    try {
      const response = await fetch("/api/merchant-profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: values.name.trim(),
          contactName: null,
          contactPhone: null,
          address: null,
          serviceItems: toServiceItems(values.servicesText),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setLoadError(getMerchantProfileErrorMessage(payload, "用户信息保存失败，请稍后重试。"));
        return;
      }

      setSaveMessage("用户信息已保存。");
    } catch {
      setLoadError("用户信息保存失败，请确认网络后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="w-full rounded-[2rem] border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] backdrop-blur sm:p-7">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-4 flex size-12 rotate-45 items-center justify-center rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-600 to-amber-200 text-black shadow-[0_0_36px_rgba(245,158,11,0.22)]">
            <div className="-rotate-45">
              <UserRound className="size-5" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/70">
            User Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white [font-family:var(--font-cormorant)]">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{description}</p>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-2xl border-white/10 bg-white/5 px-4 text-white/70 hover:bg-white/10 hover:text-white"
          asChild
        >
          <Link href="/dashboard/import">跳到后台</Link>
        </Button>
      </div>

      {!loaded ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          正在加载用户信息...
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {loadError}
        </div>
      ) : null}

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-5">
          <div className="grid gap-2.5">
            <Label htmlFor="merchant-name" className={labelClassName}>
              昵称 / 展示名称
            </Label>
            <Input
              id="merchant-name"
              name="name"
              className={inputClassName}
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              required
              disabled={!loaded || isSaving}
            />
          </div>
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="merchant-services" className={labelClassName}>
            可提供的能力或服务
          </Label>
          <Textarea
            id="merchant-services"
            name="services"
            className={textareaClassName}
            value={values.servicesText}
            onChange={(event) => updateValue("servicesText", event.target.value)}
            placeholder="每行一项，例如：\nAI 产品设计咨询\n需求拆解\n方案评审"
            disabled={!loaded || isSaving}
          />
        </div>

        {saveMessage ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-200" aria-hidden="true" />
              {saveMessage}
            </div>
            <Button
              className="h-10 rounded-2xl border border-emerald-200/20 bg-emerald-600 text-white hover:bg-emerald-500"
              asChild
            >
              <Link href={nextHref}>{nextLabel}</Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            className="h-12 rounded-2xl border border-amber-300/20 bg-amber-600 px-6 text-base font-semibold text-white shadow-[0_14px_34px_rgba(180,83,9,0.3)] hover:bg-amber-500"
            disabled={!loaded || isSaving}
          >
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                保存中
              </>
            ) : (
              "保存用户信息"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl border-white/10 bg-white/5 px-6 text-white/70 hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href="/dashboard/import">稍后再补</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
