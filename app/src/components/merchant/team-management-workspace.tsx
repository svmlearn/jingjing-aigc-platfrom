"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

import type {
  MerchantTeamInvitationCodeDto,
  MerchantTeamManagementDto,
  MerchantTeamMemberDto,
} from "@/contracts/merchant";
import { cn } from "@/lib/utils";

type TeamPayload = {
  team?: MerchantTeamManagementDto;
  error?: {
    message?: string;
  };
};

type InvitationPayload = TeamPayload & {
  invitationCode?: MerchantTeamInvitationCodeDto;
};

export function TeamManagementWorkspace() {
  const [team, setTeam] = useState<MerchantTeamManagementDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("20");
  const [expiresDays, setExpiresDays] = useState("30");
  const [note, setNote] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeInvitationCodes = useMemo(
    () => team?.invitationCodes.filter((item) => item.status === "active") ?? [],
    [team],
  );

  const newestCode = activeInvitationCodes[0]?.code ?? null;

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/merchant-team", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as TeamPayload | null;

      if (!response.ok || !data?.team) {
        throw new Error(data?.error?.message ?? "团队数据加载失败");
      }

      setTeam(data.team);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "团队数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeam();
  }, [loadTeam]);

  async function createInvitationCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const parsedMaxRedemptions = Number.parseInt(maxRedemptions, 10);
      const parsedExpiresDays = Number.parseInt(expiresDays, 10);
      const expiresAt =
        Number.isFinite(parsedExpiresDays) && parsedExpiresDays > 0
          ? new Date(Date.now() + parsedExpiresDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
      const response = await fetch("/api/merchant-team/invitation-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: code.trim() || undefined,
          maxRedemptions:
            Number.isFinite(parsedMaxRedemptions) && parsedMaxRedemptions > 0
              ? parsedMaxRedemptions
              : 20,
          expiresAt,
          note: note.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as InvitationPayload | null;

      if (!response.ok || !data?.team || !data.invitationCode) {
        throw new Error(data?.error?.message ?? "邀请码创建失败");
      }

      setTeam(data.team);
      setCode("");
      setNote("");
      void copyInviteLink(data.invitationCode.code);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "邀请码创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function copyInviteLink(invitationCode: string) {
    const copied = await writeClipboardText(buildInviteLink(window.location.origin, invitationCode));
    setCopiedCode(copied ? invitationCode : "failed");
    window.setTimeout(() => setCopiedCode(null), 1800);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/40">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        正在读取团队成员
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-8">
        <div>
          <h1 className="text-xl [font-family:var(--font-cormorant)]">团队成员</h1>
          <p className="text-xs text-white/35">邀请码、成员和一周内容分发对象</p>
        </div>
        <button
          type="button"
          onClick={() => void loadTeam()}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          刷新
        </button>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-xl border border-white/10 bg-[#090909] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <KeyRound className="size-4" aria-hidden="true" />
                  邀请码
                </div>
                <h2 className="mt-2 text-lg text-white">生成成员加入链接</h2>
              </div>
              {newestCode ? (
                <button
                  type="button"
                  onClick={() => void copyInviteLink(newestCode)}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                >
                  {copiedCode === newestCode ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  复制最新
                </button>
              ) : null}
            </div>

            <form onSubmit={(event) => void createInvitationCode(event)} className="mt-5 space-y-4">
              <Field label="自定义邀请码">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="留空自动生成"
                  className="w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="可加入人数">
                  <input
                    value={maxRedemptions}
                    onChange={(event) => setMaxRedemptions(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                  />
                </Field>
                <Field label="有效天数">
                  <input
                    value={expiresDays}
                    onChange={(event) => setExpiresDays(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                  />
                </Field>
              </div>

              <Field label="备注">
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="例如 5月测试成员"
                  className="w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </Field>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-black transition-opacity disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                {creating ? "生成中" : "生成邀请码"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#090909] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-white">
                <Users className="size-4 text-amber-400" aria-hidden="true" />
                成员列表
              </div>
              <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/45">
                {team?.members.length ?? 0} 人
              </span>
            </div>
            <div className="mt-4 divide-y divide-white/10">
              {team?.members.length ? (
                team.members.map((member) => <MemberRow key={member.id} member={member} />)
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                  暂无成员
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#090909] p-5 xl:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-white">
                <ShieldCheck className="size-4 text-amber-400" aria-hidden="true" />
                邀请码记录
              </div>
              <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/45">
                {team?.invitationCodes.length ?? 0} 条
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-white/35">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4 font-normal">邀请码</th>
                    <th className="py-3 pr-4 font-normal">状态</th>
                    <th className="py-3 pr-4 font-normal">使用次数</th>
                    <th className="py-3 pr-4 font-normal">过期时间</th>
                    <th className="py-3 pr-4 font-normal">备注</th>
                    <th className="py-3 text-right font-normal">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {team?.invitationCodes.length ? (
                    team.invitationCodes.map((invitationCode) => (
                      <InvitationCodeRow
                        key={invitationCode.id}
                        invitationCode={invitationCode}
                        copied={copiedCode === invitationCode.code}
                        onCopy={() => void copyInviteLink(invitationCode.code)}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-white/40">
                        暂无邀请码
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: MerchantTeamMemberDto }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <UserRound className="size-4 text-white/45" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{member.displayName || member.userId}</p>
          <p className="mt-1 truncate text-xs text-white/35">{member.userId}</p>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-lg px-2 py-1 text-xs",
          member.role === "owner"
            ? "bg-amber-500/10 text-amber-300"
            : "bg-white/5 text-white/45",
        )}
      >
        {member.role === "owner" ? "Owner" : "Member"}
      </span>
    </div>
  );
}

function InvitationCodeRow({
  invitationCode,
  copied,
  onCopy,
}: {
  invitationCode: MerchantTeamInvitationCodeDto;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <tr className="text-white/70">
      <td className="py-3 pr-4 font-mono text-xs text-white">{invitationCode.code}</td>
      <td className="py-3 pr-4">
        <span
          className={cn(
            "rounded-lg px-2 py-1 text-xs",
            invitationCode.status === "active"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-white/5 text-white/40",
          )}
        >
          {renderInvitationStatus(invitationCode.status)}
        </span>
      </td>
      <td className="py-3 pr-4 text-xs">
        {invitationCode.redemptionCount}/{invitationCode.maxRedemptions}
      </td>
      <td className="py-3 pr-4 text-xs">{formatDate(invitationCode.expiresAt)}</td>
      <td className="max-w-[220px] truncate py-3 pr-4 text-xs text-white/45">
        {invitationCode.note || "-"}
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? "已复制" : "复制链接"}
        </button>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="mb-2 text-xs text-white/40">{label}</p>
      {children}
    </label>
  );
}

function buildInviteLink(origin: string, code: string) {
  const base = origin || "";
  return `${base}/member/invite?code=${encodeURIComponent(code)}`;
}

function renderInvitationStatus(status: MerchantTeamInvitationCodeDto["status"]) {
  const labels: Record<MerchantTeamInvitationCodeDto["status"], string> = {
    active: "可用",
    disabled: "已停用",
    expired: "已过期",
  };

  return labels[status];
}

function formatDate(value?: string | null) {
  if (!value) {
    return "长期";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some embedded browser contexts expose Clipboard API but deny the permission.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}
