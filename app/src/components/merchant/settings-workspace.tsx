"use client";

import { useEffect, useState } from "react";
import { BookOpenText, Save, Settings, Tag, Target, UserRound, Users, Zap } from "lucide-react";

import type { MerchantProfileDto } from "@/contracts/merchant";
import { cn } from "@/lib/utils";
import { MerchantKnowledgeLibrary } from "@/components/merchant/merchant-knowledge-library";

const tabs = [
  { id: "basic", label: "基本信息", icon: UserRound },
  { id: "brand", label: "职业与定位", icon: Tag },
  { id: "products", label: "可提供的价值", icon: Zap },
  { id: "audience", label: "目标对象与场景", icon: Users },
  { id: "marketing", label: "行动目标", icon: Target },
  { id: "knowledge", label: "用户知识库", icon: BookOpenText },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function SettingsWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [profile, setProfile] = useState<MerchantProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/merchant-profile", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        merchantProfile?: MerchantProfileDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.merchantProfile) {
        throw new Error(data.error?.message ?? "用户信息加载失败");
      }

      setProfile(data.merchantProfile);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户信息加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!profile) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/merchant-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile.name,
          industry: profile.industry,
          serviceItems: profile.serviceItems,
          brandSummary: profile.brandSummary,
          regionSummary: profile.regionSummary,
          toneStyle: profile.toneStyle,
          defaultCta: profile.defaultCta,
          forbiddenWords: profile.forbiddenWords,
        }),
      });
      const data = (await response.json()) as {
        merchantProfile?: MerchantProfileDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.merchantProfile) {
        throw new Error(data.error?.message ?? "用户信息保存失败");
      }

      setProfile(data.merchantProfile);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户信息保存失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/40">
        正在读取用户信息...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-8">
        <div>
          <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">用户信息</h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">咨询、图文、视频共同参考</p>
        </div>
        {activeTab === "knowledge" ? null : (
          <button
            type="button"
            onClick={() => {
              void saveProfile();
            }}
            disabled={saving || !profile}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-5 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "保存中" : "保存信息"}
          </button>
        )}
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {profile ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-72 shrink-0 border-r border-white/10 bg-[#0a0a0a] p-6">
            <div className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                    activeTab === tab.id
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                      : "border-transparent text-white/65 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="text-sm">{tab.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
            <div className="mx-auto max-w-3xl space-y-6">
              {activeTab === "basic" ? (
                <>
                  <Field label="昵称 / 展示名称">
                    <input
                      value={profile.name}
                      onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                </>
              ) : null}

              {activeTab === "brand" ? (
                <>
                  <Field label="职业 / 领域标签">
                    <input
                      value={profile.industry ?? ""}
                      onChange={(event) => setProfile({ ...profile, industry: event.target.value })}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                  <Field label="个人介绍 / 背景摘要">
                    <textarea
                      value={profile.brandSummary ?? ""}
                      onChange={(event) => setProfile({ ...profile, brandSummary: event.target.value })}
                      rows={5}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                  <Field label="表达风格 / 希望呈现的状态">
                    <textarea
                      value={profile.toneStyle ?? ""}
                      onChange={(event) => setProfile({ ...profile, toneStyle: event.target.value })}
                      rows={4}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                </>
              ) : null}

              {activeTab === "products" ? (
                <Field label="可提供的能力或服务（每行一项）">
                  <textarea
                    value={profile.serviceItems.join("\n")}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        serviceItems: splitLines(event.target.value),
                      })
                    }
                    rows={8}
                    className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                  />
                </Field>
              ) : null}

              {activeTab === "audience" ? (
                <>
                  <Field label="适用对象 / 使用场景">
                    <textarea
                      value={profile.regionSummary ?? ""}
                      onChange={(event) => setProfile({ ...profile, regionSummary: event.target.value })}
                      rows={5}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                  <Field label="禁用词（每行一项）">
                    <textarea
                      value={profile.forbiddenWords.join("\n")}
                      onChange={(event) =>
                        setProfile({
                          ...profile,
                          forbiddenWords: splitLines(event.target.value),
                        })
                      }
                      rows={6}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                </>
              ) : null}

              {activeTab === "marketing" ? (
                <>
                  <Field label="希望引导对方做的下一步（每行一项）">
                    <textarea
                      value={profile.defaultCta.join("\n")}
                      onChange={(event) =>
                        setProfile({
                          ...profile,
                          defaultCta: splitLines(event.target.value),
                        })
                      }
                      rows={6}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
                    />
                  </Field>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <div className="flex items-center gap-3">
                      <Settings className="h-4 w-4 text-amber-500" />
                      <p className="text-sm text-white/80">这里保存的信息会影响咨询、图文和视频三条链路的输出结果。</p>
                    </div>
                  </div>
                </>
              ) : null}

              {activeTab === "knowledge" ? <MerchantKnowledgeLibrary /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="mb-3 text-[10px] uppercase tracking-[0.25em] text-white/35">{props.label}</p>
      {props.children}
    </label>
  );
}
