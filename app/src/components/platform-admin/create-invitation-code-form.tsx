"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, TicketPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  AdminField,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatusBadge,
  adminButtonClassName,
  adminButtonVariants,
  adminInputClassName,
} from "@/components/platform-admin/platform-admin-ui";
import { cn } from "@/lib/utils";

type GenerationMode = "auto" | "manual";

const apiErrorMessages: Record<string, string> = {
  ADMIN_SETUP_SECRET_NOT_CONFIGURED: "当前环境还没有配置管理员口令，暂时不能生成邀请码。",
  FORBIDDEN: "当前账号没有生成邀请码的权限。",
  INVITATION_CODE_EXISTS: "这个手动邀请码已经存在了，请换一个新的。",
  UNAUTHORIZED: "当前登录已失效，请重新进入管理员后台。",
  VALIDATION_FAILED: "表单内容还不完整，请检查后再试。",
};

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "邀请码生成失败，请稍后再试。";
  }

  const error = "error" in payload ? payload.error : undefined;

  if (!error || typeof error !== "object") {
    return "邀请码生成失败，请稍后再试。";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  if (code && apiErrorMessages[code]) {
    return apiErrorMessages[code];
  }

  return message ?? "邀请码生成失败，请稍后再试。";
}

function toExpiryIsoString(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T23:59:59`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function CreateInvitationCodeForm() {
  const router = useRouter();
  const [mode, setMode] = useState<GenerationMode>("auto");
  const [note, setNote] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNote = note.trim();
    const trimmedManualCode = manualCode.trim();
    const parsedMaxRedemptions = Number.parseInt(maxRedemptions, 10);
    const expiresAtIso = toExpiryIsoString(expiresAt);

    if (!trimmedNote) {
      setErrorMessage("先给这个邀请码填一个名称或渠道备注，后面才好区分来源。");
      return;
    }

    if (!Number.isInteger(parsedMaxRedemptions) || parsedMaxRedemptions < 1 || parsedMaxRedemptions > 50) {
      setErrorMessage("可使用次数请填写 1 到 50 之间的整数。");
      return;
    }

    if (expiresAt && !expiresAtIso) {
      setErrorMessage("过期时间格式不对，请重新选择一个日期。");
      return;
    }

    if (mode === "manual" && trimmedManualCode.length < 4) {
      setErrorMessage("手动邀请码至少填 4 个字符，方便识别也避免重复。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      const response = await fetch("/api/platform-admin/invitation-codes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code: mode === "manual" ? trimmedManualCode : undefined,
          maxRedemptions: parsedMaxRedemptions,
          expiresAt: expiresAtIso,
          note: trimmedNote,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { invitationCode?: { code?: string } }
        | null;

      if (!response.ok) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      const createdCode = payload?.invitationCode?.code;
      router.push(
        `/platform-admin/invitation-codes${createdCode ? `?created=${encodeURIComponent(createdCode)}` : ""}`,
      );
      router.refresh();
    } catch {
      setErrorMessage("邀请码生成失败，请确认网络和当前登录状态后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="生成邀请码"
        description="这里只保留真正需要填的内容：邀请码名称、可使用次数，以及是否手动指定邀请码。用途固定为商户注册。"
        action={
          <Link
            href="/platform-admin/invitation-codes"
            className={cn(adminButtonClassName, adminButtonVariants.secondary)}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            返回邀请码管理
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <AdminPanel>
          <form onSubmit={handleSubmit} className="grid gap-5 p-5 md:p-6">
            <AdminField label="生成方式">
              <div className="grid max-w-md grid-cols-2 gap-2">
                {(["auto", "manual"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      adminButtonClassName,
                      mode === item
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : adminButtonVariants.secondary,
                    )}
                    onClick={() => setMode(item)}
                  >
                    {item === "auto" ? "自动生成" : "手动填写"}
                  </button>
                ))}
              </div>
            </AdminField>

            <AdminNotice tone="info">
              当前这批邀请码固定用于 <AdminStatusBadge status="active" label="商户注册" />，
              提交后会直接写入真实邀请码记录。
            </AdminNotice>

            <AdminField label="邀请码名称 / 渠道备注" hint="这个字段就是后面在列表里识别来源用的名字。">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：深圳线下打样"
                maxLength={200}
                className={adminInputClassName}
              />
            </AdminField>

            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="可使用次数">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxRedemptions}
                  onChange={(event) => setMaxRedemptions(event.target.value)}
                  className={adminInputClassName}
                />
              </AdminField>
              <AdminField label="过期时间">
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className={adminInputClassName}
                />
              </AdminField>
            </div>

            {mode === "manual" ? (
              <AdminField label="手动邀请码">
                <input
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="例如：SZTEST2026"
                  minLength={4}
                  maxLength={80}
                  className={adminInputClassName}
                />
              </AdminField>
            ) : null}

            {errorMessage ? <AdminNotice tone="danger">{errorMessage}</AdminNotice> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={cn(adminButtonClassName, adminButtonVariants.primary)}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    生成中
                  </>
                ) : (
                  "生成邀请码"
                )}
              </button>
              <Link
                href="/platform-admin/invitation-codes"
                className={cn(adminButtonClassName, adminButtonVariants.secondary)}
              >
                取消
              </Link>
            </div>
          </form>
        </AdminPanel>

        <AdminPanel className="p-5">
          <div className="flex items-start gap-3">
            <TicketPlus className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-white/80">当前生成规则</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-white/40">
                <li>名称字段用于内部识别来源，不会暴露给商家。</li>
                <li>不填过期时间就表示长期有效，直到被用完或手动停用。</li>
                <li>提交后写入真实邀请码 API，不做本地假列表。</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 border-t border-white/[0.06] pt-5 text-sm">
            <p className="font-medium text-white/80">当前设置预览</p>
            <dl className="mt-3 grid gap-3 text-white/40">
              {[
                { label: "生成方式", value: mode === "auto" ? "自动生成" : "手动填写" },
                { label: "邀请码名称", value: note.trim() || "未填写" },
                { label: "可使用次数", value: maxRedemptions || "1" },
                { label: "过期时间", value: expiresAt || "不限" },
                ...(mode === "manual"
                  ? [{ label: "手动邀请码", value: manualCode.trim() || "未填写" }]
                  : []),
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt>{row.label}</dt>
                  <dd className="break-words text-right font-medium text-white/75">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
