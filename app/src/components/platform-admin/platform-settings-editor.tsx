"use client";

import { useEffect, useState } from "react";

import type { PlatformSettingsDto } from "@/contracts/platform-admin";

const consultationSkillOptions: Array<{
  key: PlatformSettingsDto["consultationAgent"]["enabledTools"][number];
  label: string;
  description: string;
}> = [
  {
    key: "read_merchant_profile",
    label: "读取商家资料",
    description: "把门店、服务、CTA、禁忌词纳入上下文。",
  },
  {
    key: "retrieve_knowledge_base",
    label: "检索平台知识库",
    description: "按 knowledge runtime 召回 indexed chunks。",
  },
  {
    key: "read_history",
    label: "读取历史内容",
    description: "使用当前会话和历史内容做连续诊断。",
  },
  {
    key: "update_strategy_snapshot",
    label: "更新策略快照",
    description: "沉淀定位、卖点、客群、场景和建议。",
  },
  {
    key: "update_content_calendar",
    label: "更新内容日历",
    description: "生成图文/视频混合的一周内容草案。",
  },
  {
    key: "generate_article_brief",
    label: "生成图文草案",
    description: "准备图文工作台的默认选题与标题方向。",
  },
  {
    key: "generate_video_brief",
    label: "生成视频草案",
    description: "准备视频钩子、脚本方向和执行目标。",
  },
];

export function PlatformSettingsEditor() {
  const [settings, setSettings] = useState<PlatformSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/platform-admin/settings", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        settings?: PlatformSettingsDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.settings) {
        throw new Error(data.error?.message ?? "平台设置加载失败");
      }

      setSettings(data.settings);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "平台设置加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/platform-admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });
      const data = (await response.json()) as {
        settings?: PlatformSettingsDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.settings) {
        throw new Error(data.error?.message ?? "平台设置保存失败");
      }

      setSettings(data.settings);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "平台设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings();
  }, []);

  if (loading) {
    return <div className="text-sm text-[#5d6b7a]">正在读取平台配置...</div>;
  }

  if (!settings) {
    return <div className="text-sm text-[#b91c1c]">平台配置读取失败。</div>;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#17202a]">系统配置</p>
          <p className="mt-1 text-sm leading-6 text-[#5d6b7a]">
            这里直接读写真实 `platform_settings`，会影响下一轮咨询与内容生成。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void saveSettings();
          }}
          disabled={saving}
          className="rounded-md bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>

      <Section title="LLM Runtime">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Provider Label">
            <input
              value={settings.llmRuntime.providerLabel}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, providerLabel: event.target.value },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Base URL">
            <input
              value={settings.llmRuntime.baseUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, baseUrl: event.target.value },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Primary Model">
            <input
              value={settings.llmRuntime.primaryModel}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, primaryModel: event.target.value },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Fallback Model">
            <input
              value={settings.llmRuntime.fallbackModel ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, fallbackModel: event.target.value || null },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section title="Consultation Agent">
        <div className="grid gap-4">
          <Field label="System Prompt">
            <textarea
              value={settings.consultationAgent.systemPrompt}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  consultationAgent: {
                    ...settings.consultationAgent,
                    systemPrompt: event.target.value,
                  },
                })
              }
              rows={5}
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Model">
            <input
              value={settings.consultationAgent.model}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  consultationAgent: {
                    ...settings.consultationAgent,
                    model: event.target.value,
                  },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-[#17202a]">Enabled Skills / Tools</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {consultationSkillOptions.map((skill) => {
                const enabled = settings.consultationAgent.enabledTools.includes(skill.key);

                return (
                  <label
                    key={skill.key}
                    className="flex cursor-pointer gap-3 rounded-md border border-[#dde3ea] bg-white p-3 text-sm transition-colors hover:border-[#93c5fd] hover:bg-[#f8fbff]"
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => {
                        const nextTools = event.target.checked
                          ? [...settings.consultationAgent.enabledTools, skill.key]
                          : settings.consultationAgent.enabledTools.filter((tool) => tool !== skill.key);

                        setSettings({
                          ...settings,
                          consultationAgent: {
                            ...settings.consultationAgent,
                            enabledTools:
                              nextTools.length > 0
                                ? nextTools
                                : settings.consultationAgent.enabledTools,
                          },
                        });
                      }}
                      className="mt-1 size-4 accent-[#1d4ed8]"
                    />
                    <span>
                      <span className="block font-medium text-[#17202a]">{skill.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#5d6b7a]">
                        {skill.description}
                      </span>
                      <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#7b8794]">
                        {skill.key}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <NumberField
              label="Max Rounds"
              value={settings.consultationAgent.maxRounds}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  consultationAgent: { ...settings.consultationAgent, maxRounds: value },
                })
              }
            />
            <NumberField
              label="Retrieval Top K"
              value={settings.consultationAgent.retrievalTopK}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  consultationAgent: { ...settings.consultationAgent, retrievalTopK: value },
                })
              }
            />
            <Field label="Visible Mode">
              <select
                value={settings.consultationAgent.visibleExecutionMode}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    consultationAgent: {
                      ...settings.consultationAgent,
                      visibleExecutionMode: event.target.value as PlatformSettingsDto["consultationAgent"]["visibleExecutionMode"],
                    },
                  })
                }
                className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
              >
                <option value="cards">cards</option>
                <option value="minimal">minimal</option>
              </select>
            </Field>
            <NumberField
              label="Temperature x100"
              value={Math.round(settings.consultationAgent.temperature * 100)}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  consultationAgent: {
                    ...settings.consultationAgent,
                    temperature: value / 100,
                  },
                })
              }
            />
          </div>
        </div>
      </Section>

      <Section title="Knowledge Runtime">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <NumberField
            label="Retrieval Top K"
            value={settings.knowledgeRuntime.retrievalTopK}
            onChange={(value) =>
              setSettings({
                ...settings,
                knowledgeRuntime: { ...settings.knowledgeRuntime, retrievalTopK: value },
              })
            }
          />
          <NumberField
            label="Chunk Size"
            value={settings.knowledgeRuntime.chunkSize}
            onChange={(value) =>
              setSettings({
                ...settings,
                knowledgeRuntime: { ...settings.knowledgeRuntime, chunkSize: value },
              })
            }
          />
          <NumberField
            label="Chunk Overlap"
            value={settings.knowledgeRuntime.chunkOverlap}
            onChange={(value) =>
              setSettings({
                ...settings,
                knowledgeRuntime: { ...settings.knowledgeRuntime, chunkOverlap: value },
              })
            }
          />
          <Field label="Embedding Model">
            <input
              value={settings.knowledgeRuntime.embeddingModel}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  knowledgeRuntime: {
                    ...settings.knowledgeRuntime,
                    embeddingModel: event.target.value,
                  },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Query Rewrite">
            <select
              value={String(settings.knowledgeRuntime.queryRewriteEnabled)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  knowledgeRuntime: {
                    ...settings.knowledgeRuntime,
                    queryRewriteEnabled: event.target.value === "true",
                  },
                })
              }
              className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            >
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </Field>
        </div>
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[#dde3ea] bg-white p-5">
      <h2 className="text-base font-semibold text-[#17202a]">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-medium text-[#17202a]">{props.label}</p>
      {props.children}
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={props.label}>
      <input
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number.parseInt(event.target.value || "0", 10))}
        className="w-full rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
      />
    </Field>
  );
}
