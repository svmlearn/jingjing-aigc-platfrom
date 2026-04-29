"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function AuthBackButton({
  fallbackHref = "/",
  className,
}: {
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    window.location.assign(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={cn(
        "fixed left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/70 backdrop-blur transition-colors hover:bg-white/10 hover:text-white md:left-6 md:top-6",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      返回
    </button>
  );
}
