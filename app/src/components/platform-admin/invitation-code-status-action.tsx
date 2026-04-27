"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PlatformAdminInvitationCodeDto } from "@/contracts/platform-admin";
import {
  adminButtonClassName,
  adminButtonVariants,
} from "@/components/platform-admin/platform-admin-ui";
import { cn } from "@/lib/utils";

const actionErrorMessages: Record<string, string> = {
  INVITATION_CODE_CANNOT_DISABLE: "当前状态下不能停用这条邀请码。",
  INVITATION_CODE_CANNOT_ACTIVATE: "当前状态下不能重新启用这条邀请码。",
  PLATFORM_INVITATION_CODE_NOT_FOUND: "邀请码记录不存在，刷新后再试。",
  UNAUTHORIZED: "当前登录已失效，请重新进入管理员后台。",
};

function getActionErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "邀请码状态更新失败，请稍后重试。";
  }

  const error = "error" in payload ? payload.error : undefined;

  if (!error || typeof error !== "object") {
    return "邀请码状态更新失败，请稍后重试。";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  if (code && actionErrorMessages[code]) {
    return actionErrorMessages[code];
  }

  return message ?? "邀请码状态更新失败，请稍后重试。";
}

export function InvitationCodeStatusAction({
  invitationCode,
}: {
  invitationCode: PlatformAdminInvitationCodeDto;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function handleToggle(nextStatus: "active" | "disabled") {
    setIsPending(true);
    setErrorMessage(undefined);

    try {
      const response = await fetch(
        `/api/platform-admin/invitation-codes/${invitationCode.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(getActionErrorMessage(payload));
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("邀请码状态更新失败，请确认网络和当前登录状态后重试。");
    } finally {
      setIsPending(false);
    }
  }

  if (invitationCode.status === "active") {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className={cn(adminButtonClassName, adminButtonVariants.secondary, "min-h-8 px-2 py-1")}
          disabled={isPending}
          onClick={() => handleToggle("disabled")}
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-3 animate-spin" />
              停用中
            </>
          ) : (
            "停用"
          )}
        </button>
        {errorMessage ? <p className="text-xs text-red-300">{errorMessage}</p> : null}
      </div>
    );
  }

  if (invitationCode.status === "disabled") {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className={cn(adminButtonClassName, adminButtonVariants.secondary, "min-h-8 px-2 py-1")}
          disabled={isPending}
          onClick={() => handleToggle("active")}
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-3 animate-spin" />
              启用中
            </>
          ) : (
            "重新启用"
          )}
        </button>
        {errorMessage ? <p className="text-xs text-red-300">{errorMessage}</p> : null}
      </div>
    );
  }

  return <span className="text-sm text-white/30">不可操作</span>;
}
