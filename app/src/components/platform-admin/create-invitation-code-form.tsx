"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, TicketPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GenerationMode = "auto" | "manual";

const apiErrorMessages: Record<string, string> = {
  ADMIN_SETUP_SECRET_NOT_CONFIGURED: "当前环境还没有配置管理员口令，暂时不能生成邀请码。",
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

  const modeButtonClassName =
    "h-11 justify-center rounded-md border text-sm font-medium transition-colors";

  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="生成邀请码"
        description="这里只保留真正需要填的内容：邀请码名称、可使用次数，以及是否手动指定邀请码。用途固定为商户注册，不再单独填写。"
        action={
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/platform-admin/invitation-codes">
              <ArrowLeft className="size-4" />
              返回邀请码管理
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm md:p-6"
        >
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label>生成方式</Label>
              <div className="grid max-w-md grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={`${modeButtonClassName} ${mode === "auto" ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]" : ""}`}
                  onClick={() => setMode("auto")}
                >
                  自动生成
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${modeButtonClassName} ${mode === "manual" ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]" : ""}`}
                  onClick={() => setMode("manual")}
                >
                  手动填写
                </Button>
              </div>
              <p className="text-sm leading-6 text-[#5d6b7a]">
                自动生成会在提交时给你一串随机邀请码；如果这批要发固定码，再切到手动填写。
              </p>
            </div>

            <div className="rounded-md border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm leading-6 text-[#1e3a8a]">
              当前这批邀请码固定用于 <Badge className="ml-1 rounded-md bg-white text-[#1d4ed8]">商户注册</Badge>，
              这里不再额外填写“用途”字段。
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-note">邀请码名称 / 渠道备注</Label>
              <Input
                id="invite-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：深圳线下打样"
                maxLength={200}
              />
              <p className="text-sm leading-6 text-[#5d6b7a]">
                这个字段就是你后面在列表里识别来源用的“名字”。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="max-redemptions">可使用次数</Label>
                <Input
                  id="max-redemptions"
                  type="number"
                  min={1}
                  max={50}
                  value={maxRedemptions}
                  onChange={(event) => setMaxRedemptions(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expires-at">过期时间</Label>
                <Input
                  id="expires-at"
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
            </div>

            {mode === "manual" ? (
              <div className="grid gap-2">
                <Label htmlFor="manual-code">手动邀请码</Label>
                <Input
                  id="manual-code"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="例如：SZTEST2026"
                  minLength={4}
                  maxLength={80}
                />
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-md border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#be123c]">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    生成中
                  </>
                ) : (
                  "生成邀请码"
                )}
              </Button>
              <Button asChild variant="outline" className="rounded-md">
                <Link href="/platform-admin/invitation-codes">取消</Link>
              </Button>
            </div>
          </div>
        </form>

        <aside className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <TicketPlus className="mt-0.5 size-4 text-[#1d4ed8]" aria-hidden="true" />
            <div>
              <p className="font-medium text-[#17202a]">当前生成规则</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#5d6b7a]">
                <li>名称字段用于内部识别来源，不会暴露给商家。</li>
                <li>不填过期时间就表示长期有效，直到被用完或手动停用。</li>
                <li>提交后会直接写入真实邀请码记录，不再只是演示页面。</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-[#dde3ea] bg-white p-4 text-sm">
            <p className="font-medium text-[#17202a]">当前设置预览</p>
            <dl className="mt-3 grid gap-3 text-[#5d6b7a]">
              <div className="flex items-center justify-between gap-3">
                <dt>生成方式</dt>
                <dd className="font-medium text-[#17202a]">
                  {mode === "auto" ? "自动生成" : "手动填写"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>邀请码名称</dt>
                <dd className="text-right font-medium text-[#17202a]">
                  {note.trim() || "未填写"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>可使用次数</dt>
                <dd className="font-medium text-[#17202a]">{maxRedemptions || "1"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>过期时间</dt>
                <dd className="font-medium text-[#17202a]">{expiresAt || "不限"}</dd>
              </div>
              {mode === "manual" ? (
                <div className="flex items-center justify-between gap-3">
                  <dt>手动邀请码</dt>
                  <dd className="text-right font-medium text-[#17202a]">
                    {manualCode.trim() || "未填写"}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
