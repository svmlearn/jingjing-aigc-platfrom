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
    <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#dde3ea] pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-[#e6fffb] text-[#0f766e]">
            <Store className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d6b7a]">{description}</p>
        </div>
        <Button variant="outline" className="h-10 rounded-md" asChild>
          <Link href="/dashboard/import">跳到后台</Link>
        </Button>
      </div>

      {!loaded ? (
        <div className="mt-5 flex items-center gap-2 rounded-md border border-[#dde3ea] bg-[#f8fafc] px-4 py-3 text-sm text-[#5d6b7a]">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          正在加载商户资料...
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-5 rounded-md border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#be123c]">
          {loadError}
        </div>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="merchant-name">商户名称</Label>
            <Input
              id="merchant-name"
              name="name"
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              required
              disabled={!loaded || isSaving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-phone">联系电话</Label>
            <Input
              id="merchant-phone"
              name="contactPhone"
              value={values.contactPhone}
              onChange={(event) => updateValue("contactPhone", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-contact">联系人</Label>
            <Input
              id="merchant-contact"
              name="contactName"
              value={values.contactName}
              onChange={(event) => updateValue("contactName", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-address">地址</Label>
            <Input
              id="merchant-address"
              name="address"
              value={values.address}
              onChange={(event) => updateValue("address", event.target.value)}
              disabled={!loaded || isSaving}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="merchant-services">服务项目</Label>
          <Textarea
            id="merchant-services"
            name="services"
            className="min-h-28"
            value={values.servicesText}
            onChange={(event) => updateValue("servicesText", event.target.value)}
            placeholder="每行一个服务项目，例如：\n肩颈调理\n产后修复\n私教体验课"
            disabled={!loaded || isSaving}
          />
        </div>

        {saveMessage ? (
          <div className="flex flex-col gap-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-sm text-[#166534] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {saveMessage}
            </div>
            <Button className="h-10 rounded-md bg-[#166534] text-white hover:bg-[#14532d]" asChild>
              <Link href={nextHref}>{nextLabel}</Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
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
          <Button type="button" variant="outline" className="h-11 rounded-md" asChild>
            <Link href="/dashboard/import">稍后再补</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
