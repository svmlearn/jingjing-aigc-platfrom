"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle, Store } from "lucide-react";
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
  contactPhone: string;
  contactName: string;
  address: string;
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
    contactPhone: "",
    contactName: "",
    address: "",
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
              getMerchantProfileErrorMessage(payload, "当前还没有拿到商户资料，请先完成邀请码注册。"),
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
          contactPhone: payload.merchantProfile.contactPhone ?? "",
          contactName: payload.merchantProfile.contactName ?? "",
          address: payload.merchantProfile.address ?? "",
          servicesText: toServicesText(payload.merchantProfile.serviceItems),
        });
        setLoaded(true);
      } catch {
        if (active) {
          setLoadError("商户资料加载失败，请稍后重试。");
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
          contactName: values.contactName.trim() || null,
          contactPhone: values.contactPhone.trim() || null,
          address: values.address.trim() || null,
          serviceItems: toServiceItems(values.servicesText),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setLoadError(getMerchantProfileErrorMessage(payload, "商户资料保存失败，请稍后重试。"));
        return;
      }

      setSaveMessage("商户资料已保存到真实商户记录。");
    } catch {
      setLoadError("商户资料保存失败，请确认网络后重试。");
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
              <Store className="size-5" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/70">
            Merchant Profile
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
          正在加载商户资料...
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {loadError}
        </div>
      ) : null}

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2.5">
            <Label htmlFor="merchant-name" className={labelClassName}>
              商户名称
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
          <div className="grid gap-2.5">
            <Label htmlFor="merchant-phone" className={labelClassName}>
              联系电话
            </Label>
            <Input
              id="merchant-phone"
              name="contactPhone"
              className={inputClassName}
              value={values.contactPhone}
              onChange={(event) => updateValue("contactPhone", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="merchant-contact" className={labelClassName}>
              联系人
            </Label>
            <Input
              id="merchant-contact"
              name="contactName"
              className={inputClassName}
              value={values.contactName}
              onChange={(event) => updateValue("contactName", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="merchant-address" className={labelClassName}>
              地址
            </Label>
            <Input
              id="merchant-address"
              name="address"
              className={inputClassName}
              value={values.address}
              onChange={(event) => updateValue("address", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="merchant-services" className={labelClassName}>
            服务项目
          </Label>
          <Textarea
            id="merchant-services"
            name="services"
            className={textareaClassName}
            value={values.servicesText}
            onChange={(event) => updateValue("servicesText", event.target.value)}
            placeholder="每行一个服务项目，例如：\n肩颈调理\n产后修复\n私教体验课"
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
              "保存商户资料"
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
