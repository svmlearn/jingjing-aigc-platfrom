"use client";

import Link from "next/link";
import { CheckCircle2, Store } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { merchantProfile } from "@/lib/ui/mock-api";

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
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
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

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="merchant-name">商户名称</Label>
            <Input id="merchant-name" name="name" defaultValue={merchantProfile.name} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-phone">联系电话</Label>
            <Input id="merchant-phone" name="contactPhone" defaultValue={merchantProfile.contactPhone} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-contact">联系人</Label>
            <Input id="merchant-contact" name="contactName" defaultValue={merchantProfile.contactName} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-address">地址</Label>
            <Input id="merchant-address" name="address" defaultValue={merchantProfile.address} required />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="merchant-services">服务项目</Label>
          <Textarea
            id="merchant-services"
            name="services"
            className="min-h-28"
            defaultValue={merchantProfile.services}
            required
          />
        </div>

        {saved ? (
          <div className="flex flex-col gap-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-sm text-[#166534] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              商户资料已保存到 mock adapter。
            </div>
            <Button className="h-10 rounded-md bg-[#166534] text-white hover:bg-[#14532d]" asChild>
              <Link href={nextHref}>{nextLabel}</Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
            保存商户资料
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-md" asChild>
            <Link href="/dashboard/import">稍后再补</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
