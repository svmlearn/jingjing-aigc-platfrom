"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Save, UserPlus } from "lucide-react";

import type { PlatformAdminUserDto, PlatformSettingsDto } from "@/contracts/platform-admin";
import {
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminPanelHeader,
  AdminStatusBadge,
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
    label: "检索平台方法论与商家上下文",
    description: "按 knowledge runtime 召回平台方法论与当前商家的 indexed chunks。",
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

const adminUserApiErrorMessages: Record<string, string> = {
  FORBIDDEN: "当前账号没有管理员账号管理权限。",
  LAST_SUPER_ADMIN_REQUIRED: "至少要保留一个 active 状态的 super_admin。",
  PLATFORM_ADMIN_AUTH_USER_CREATE_FAILED: "Supabase Auth 用户创建失败，请检查邮箱或密码。",
  PLATFORM_ADMIN_USER_CREATE_FAILED: "后台管理员身份创建失败，请检查是否已存在同邮箱账号。",
  PLATFORM_ADMIN_USER_NOT_FOUND: "后台管理员记录不存在，请刷新后再试。",
  PLATFORM_ADMIN_USER_UPDATE_FAILED: "后台管理员更新失败，请稍后重试。",
  UNAUTHORIZED: "当前登录已失效，请重新登录。",
  VALIDATION_FAILED: "表单内容还不完整，请检查后再试。",
};

function getAdminUserApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "管理员账号操作失败，请稍后重试。";
  }

  const error = "error" in payload ? payload.error : undefined;

  if (!error || typeof error !== "object") {
    return "管理员账号操作失败，请稍后重试。";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  if (code && adminUserApiErrorMessages[code]) {
    return adminUserApiErrorMessages[code];
  }

  return message ?? "管理员账号操作失败，请稍后重试。";
}

export function PlatformSettingsEditor({
  currentAdmin,
}: {
  currentAdmin: PlatformAdminUserDto;
}) {
  const [settings, setSettings] = useState<PlatformSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageSettings = currentAdmin.role === "super_admin";

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

    if (!canManageSettings) {
      setError("当前账号没有修改系统配置的权限。");
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
          disabled={saving || !canManageSettings}
          className={cn(adminButtonClassName, adminButtonVariants.primary)}
        >
          <Save className="size-3.5" aria-hidden="true" />
          {saving ? "保存中" : "保存配置"}
        </button>
      </div>

      {!canManageSettings ? (
        <AdminNotice tone="warning">
          当前为 admin 角色，只能查看系统配置；修改配置和管理员账号管理仅限 super_admin。
        </AdminNotice>
      ) : null}

      <fieldset disabled={!canManageSettings} className="grid gap-6 disabled:opacity-75">
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
                    llmRuntime: {
                      ...settings.llmRuntime,
                      fallbackModel: event.target.value || null,
                    },
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
                      visibleExecutionMode:
                        event.target.value as PlatformSettingsDto["consultationAgent"]["visibleExecutionMode"],
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
                            : settings.consultationAgent.enabledTools.filter(
                                (tool) => tool !== skill.key,
                              );

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
          <AdminPanelHeader eyebrow="Script Production Agent" />
          <div className="grid gap-5 p-5">
            <AdminField label="System Prompt">
              <textarea
                value={settings.scriptProductionAgent.systemPrompt}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scriptProductionAgent: {
                      ...settings.scriptProductionAgent,
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
                  value={settings.scriptProductionAgent.model}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      scriptProductionAgent: {
                        ...settings.scriptProductionAgent,
                        model: event.target.value,
                      },
                    })
                  }
                  className={adminInputClassName}
                />
              </AdminField>
              <NumberField
                label="Temperature x100"
                value={Math.round(settings.scriptProductionAgent.temperature * 100)}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    scriptProductionAgent: {
                      ...settings.scriptProductionAgent,
                      temperature: value / 100,
                    },
                  })
                }
              />
              <NumberField
                label="Evidence Top K"
                value={settings.scriptProductionAgent.retrievalTopK}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    scriptProductionAgent: {
                      ...settings.scriptProductionAgent,
                      retrievalTopK: value,
                    },
                  })
                }
              />
              <AdminField label="Revision Flow">
                <select
                  value={String(settings.scriptProductionAgent.revisionEnabled)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      scriptProductionAgent: {
                        ...settings.scriptProductionAgent,
                        revisionEnabled: event.target.value === "true",
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
      </fieldset>

      {canManageSettings ? <PlatformAdminUsersPanel currentAdmin={currentAdmin} /> : null}
    </div>
  );
}

function PlatformAdminUsersPanel({
  currentAdmin,
}: {
  currentAdmin: PlatformAdminUserDto;
}) {
  const [adminUsers, setAdminUsers] = useState<PlatformAdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<{
    email: string;
    password: string;
    displayName: string;
    role: PlatformAdminUserDto["role"];
  }>({
    email: "",
    password: "",
    displayName: "",
    role: "admin",
  });

  async function loadAdminUsers() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/platform-admin/admin-users", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        adminUsers?: PlatformAdminUserDto[];
        error?: { message?: string };
      };

      if (!response.ok || !data.adminUsers) {
        throw new Error(data.error?.message ?? "管理员账号加载失败");
      }

      setAdminUsers(data.adminUsers);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "管理员账号加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function createAdminUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/platform-admin/admin-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          displayName: createForm.displayName || null,
          role: createForm.role,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getAdminUserApiErrorMessage(data));
      }

      setCreateForm({
        email: "",
        password: "",
        displayName: "",
        role: "admin",
      });
      await loadAdminUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "管理员账号创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function updateAdminUser(
    adminUserId: string,
    patch: Partial<Pick<PlatformAdminUserDto, "displayName" | "role" | "status">>,
  ) {
    setSavingId(adminUserId);
    setError(null);

    try {
      const response = await fetch(`/api/platform-admin/admin-users/${adminUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getAdminUserApiErrorMessage(data));
      }

      await loadAdminUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "管理员账号更新失败");
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAdminUsers();
  }, []);

  return (
    <AdminPanel>
      <AdminPanelHeader
        eyebrow="管理员账号"
        description="密码由 Supabase Auth 管理；这里的角色和状态写入 platform_admin_users，用于后台页面和 API 的 RBAC。"
      />
      <div className="grid gap-5 p-5">
        {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}

        <form onSubmit={createAdminUser} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_150px_auto]">
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
            placeholder="邮箱"
            className={adminInputClassName}
            required
          />
          <input
            value={createForm.displayName}
            onChange={(event) =>
              setCreateForm({ ...createForm, displayName: event.target.value })
            }
            placeholder="显示名称"
            className={adminInputClassName}
          />
          <input
            type="password"
            value={createForm.password}
            onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
            placeholder="初始密码"
            minLength={8}
            className={adminInputClassName}
            required
          />
          <select
            value={createForm.role}
            onChange={(event) =>
              setCreateForm({
                ...createForm,
                role: event.target.value as PlatformAdminUserDto["role"],
              })
            }
            className={adminSelectClassName}
          >
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className={cn(adminButtonClassName, adminButtonVariants.primary)}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            {creating ? "创建中" : "新增"}
          </button>
        </form>

        {loading ? (
          <div className="text-sm text-white/40">正在读取管理员账号...</div>
        ) : adminUsers.length === 0 ? (
          <AdminEmptyState title="暂无管理员账号" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#080808] text-white/35">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest">账号</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest">角色</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest">状态</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest">最近登录</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {adminUsers.map((adminUser) => (
                  <tr key={adminUser.id} className="bg-[#0d0d0d]">
                    <td className="px-4 py-3">
                      <div className="grid gap-1">
                        <span className="font-medium text-white/78">
                          {adminUser.displayName || adminUser.email}
                          {adminUser.id === currentAdmin.id ? "（当前账号）" : ""}
                        </span>
                        <span className="text-xs text-white/35">{adminUser.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={adminUser.role}
                        disabled={savingId === adminUser.id}
                        onChange={(event) => {
                          void updateAdminUser(adminUser.id, {
                            role: event.target.value as PlatformAdminUserDto["role"],
                          });
                        }}
                        className={cn(adminSelectClassName, "h-8")}
                      >
                        <option value="admin">admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={adminUser.status}
                        disabled={savingId === adminUser.id}
                        onChange={(event) => {
                          void updateAdminUser(adminUser.id, {
                            status: event.target.value as PlatformAdminUserDto["status"],
                          });
                        }}
                        className={cn(adminSelectClassName, "h-8")}
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-white/40">
                      <div className="grid gap-1">
                        <AdminStatusBadge status={adminUser.status} label={adminUser.status} />
                        <span>
                          {adminUser.lastLoginAt
                            ? new Date(adminUser.lastLoginAt).toLocaleString("zh-CN")
                            : "未登录"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPanel>
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
