import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const adminInputClassName =
  "h-9 w-full min-w-0 rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-amber-500/60 focus:ring-3 focus:ring-amber-500/10 disabled:cursor-not-allowed disabled:opacity-45";

export const adminTextareaClassName =
  "w-full min-w-0 resize-none rounded-md border border-white/10 bg-[#050505] px-3 py-2.5 text-sm leading-6 text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-amber-500/60 focus:ring-3 focus:ring-amber-500/10 disabled:cursor-not-allowed disabled:opacity-45";

export const adminSelectClassName =
  "h-9 w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-amber-500/60 focus:ring-3 focus:ring-amber-500/10 disabled:cursor-not-allowed disabled:opacity-45";

export const adminButtonClassName =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-40";

export const adminButtonVariants = {
  primary:
    "border-amber-500/45 bg-amber-600/85 text-white hover:bg-amber-500 focus-visible:ring-amber-500/20",
  secondary:
    "border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white focus-visible:ring-white/10",
  ghost:
    "border-transparent bg-transparent text-white/40 hover:bg-white/[0.06] hover:text-white/80 focus-visible:ring-white/10",
  danger:
    "border-red-500/25 bg-red-950/35 text-red-300 hover:bg-red-950/55 focus-visible:ring-red-500/15",
} as const;

const statusToneClasses: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  enabled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  indexed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  succeeded: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  online: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  draft: "border-white/15 bg-white/[0.05] text-white/60",
  queued: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  uploaded: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  processing: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  indexing: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  disabled: "border-red-500/25 bg-red-950/35 text-red-300",
  expired: "border-white/10 bg-white/[0.04] text-white/40",
  archived: "border-white/10 bg-white/[0.04] text-white/40",
  failed: "border-red-500/25 bg-red-950/35 text-red-300",
  redeemed: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  free: "border-white/15 bg-white/[0.05] text-white/55",
  plus: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  pro: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  max: "border-amber-500/35 bg-amber-500/10 text-amber-300",
};

const statusLabels: Record<string, string> = {
  active: "正常",
  enabled: "已启用",
  indexed: "已索引",
  succeeded: "成功",
  online: "线上",
  draft: "草稿",
  queued: "排队中",
  uploaded: "已上传",
  processing: "处理中",
  indexing: "索引中",
  warning: "需关注",
  disabled: "已禁用",
  expired: "已过期",
  archived: "已归档",
  failed: "失败",
  redeemed: "已用完",
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
};

export function AdminPageHeader({
  eyebrow = "平台管理台",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-white/40">
          {eyebrow}
        </div>
        <h1 className="truncate text-xl font-semibold text-white">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AdminPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-[#0d0d0d]", className)}>
      {children}
    </section>
  );
}

export function AdminPanelHeader({
  title,
  eyebrow,
  description,
  action,
  className,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-white/[0.06] bg-[#080808] px-5 py-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            {eyebrow}
          </div>
        ) : null}
        {title ? <h2 className="truncate text-sm font-semibold text-white/85">{title}</h2> : null}
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/40">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AdminStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest",
        statusToneClasses[status] ?? "border-white/10 bg-white/[0.05] text-white/50",
        className,
      )}
    >
      <span className="truncate">{label ?? statusLabels[status] ?? status}</span>
    </span>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-sm font-medium text-white/70">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-white/35">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminNotice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const toneClassName = {
    info: "border-sky-500/20 bg-sky-500/[0.07] text-sky-200/80",
    success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200/80",
    warning: "border-amber-500/25 bg-amber-500/[0.08] text-amber-200/85",
    danger: "border-red-500/25 bg-red-950/35 text-red-200/85",
  }[tone];

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm leading-6", toneClassName, className)}>
      {children}
    </div>
  );
}

export function AdminField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/40">
        {label}
      </p>
      {children}
      {hint ? <p className="mt-2 text-xs leading-5 text-white/30">{hint}</p> : null}
    </label>
  );
}

export function AdminDivider() {
  return <div className="h-px bg-white/[0.06]" />;
}
