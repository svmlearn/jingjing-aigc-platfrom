"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import type { PlatformSettingsDto } from "@/contracts/platform-admin";
import {
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminPanelHeader,
  adminButtonClassName,
  adminButtonVariants,
  adminInputClassName,
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform-admin/platform-admin-ui";
import { cn } from "@/lib/utils";

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
    return (
      <AdminPanel className="p-6">
        <div className="text-sm text-white/40">正在读取平台配置...</div>
      </AdminPanel>
    );
  }

  if (!settings) {
    return (
      <AdminEmptyState
        title="平台配置读取失败"
        description="请确认当前登录状态和平台配置 API 是否可用。"
      />
    );
  }

  return (
    <div className="grid max-w-5xl gap-6">
      {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-white/40">
          这里直接读写真实 platform settings。V2.2 Agent 容器配置在「Agent 配置」中管理，系统页保留 runtime 与全局默认参数。
        </p>
        <button
          type="button"
          onClick={() => {
            void saveSettings();
          }}
          disabled={saving}
          className={cn(adminButtonClassName, adminButtonVariants.primary)}
        >
          <Save className="size-3.5" aria-hidden="true" />
          {saving ? "保存中" : "保存配置"}
        </button>
      </div>

      <AdminPanel>
        <AdminPanelHeader eyebrow="LLM Runtime" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <AdminField label="Provider Label">
            <input
              value={settings.llmRuntime.providerLabel}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, providerLabel: event.target.value },
                })
              }
              className={adminInputClassName}
            />
          </AdminField>
          <AdminField label="Base URL">
            <input
              value={settings.llmRuntime.baseUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, baseUrl: event.target.value },
                })
              }
              className={adminInputClassName}
            />
          </AdminField>
          <AdminField label="Primary Model">
            <input
              value={settings.llmRuntime.primaryModel}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, primaryModel: event.target.value },
                })
              }
              className={adminInputClassName}
            />
          </AdminField>
          <AdminField label="Fallback Model">
            <input
              value={settings.llmRuntime.fallbackModel ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  llmRuntime: { ...settings.llmRuntime, fallbackModel: event.target.value || null },
                })
              }
              className={adminInputClassName}
            />
          </AdminField>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelHeader
          eyebrow="Consultation Agent Legacy Runtime"
          description="这里仍是旧 consultation_agent settings。V2.2 Agent 容器上线前保留兼容。"
        />
        <div className="grid gap-5 p-5">
          <AdminField label="System Prompt">
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
              rows={6}
              className={cn(adminTextareaClassName, "font-mono text-xs")}
            />
          </AdminField>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminField label="Model">
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
                className={adminInputClassName}
              />
            </AdminField>
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

          <AdminField label="Visible Mode">
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
              className={adminSelectClassName}
            >
              <option value="cards">cards</option>
              <option value="minimal">minimal</option>
            </select>
          </AdminField>

          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/40">
              Enabled Tools
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {consultationSkillOptions.map((skill) => {
                const enabled = settings.consultationAgent.enabledTools.includes(skill.key);

                return (
                  <label
                    key={skill.key}
                    className="flex cursor-pointer gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm transition-colors hover:border-amber-500/25 hover:bg-amber-500/[0.04]"
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
                      className="mt-1 size-4 accent-amber-500"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-white/75">{skill.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/38">
                        {skill.description}
                      </span>
                      <span className="mt-2 block break-all font-mono text-[10px] uppercase tracking-widest text-white/25">
                        {skill.key}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelHeader eyebrow="Knowledge Runtime" />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
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
          <AdminField label="Embedding Model">
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
              className={adminInputClassName}
            />
          </AdminField>
          <AdminField label="Query Rewrite">
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
              className={adminSelectClassName}
            >
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </AdminField>
        </div>
      </AdminPanel>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <AdminField label={props.label}>
      <input
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number.parseInt(event.target.value || "0", 10))}
        className={adminInputClassName}
      />
    </AdminField>
  );
}
