import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-[#dde3ea] pb-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold text-[#0f766e] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold text-[#17202a] md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#5d6b7a] md:text-base">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
