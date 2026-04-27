"use client";

import { type FormEvent, useEffect, useState } from "react";

import type { PlatformAdminUserDto, PlatformSettingsDto } from "@/contracts/platform-admin";

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
          disabled={saving || !canManageSettings}
          className="rounded-md bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>

      {!canManageSettings ? (
        <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm leading-6 text-[#92400e]">
          当前为 admin 角色，只能查看系统配置；修改配置和管理员账号管理仅限 super_admin。
        </div>
      ) : null}

      <fieldset disabled={!canManageSettings} className="grid gap-6 disabled:opacity-75">
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
    <Section title="管理员账号">
      <div className="grid gap-5">
        <p className="text-sm leading-6 text-[#5d6b7a]">
          密码由 Supabase Auth 管理；这里的角色和状态写入 `platform_admin_users`，用于后台页面和 API 的 RBAC。
        </p>

        {error ? (
          <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={createAdminUser}
          className="grid gap-3 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4 md:grid-cols-[1fr_1fr_1fr_150px_auto]"
        >
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
            placeholder="邮箱"
            className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            required
          />
          <input
            value={createForm.displayName}
            onChange={(event) =>
              setCreateForm({ ...createForm, displayName: event.target.value })
            }
            placeholder="显示名称"
            className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={createForm.password}
            onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
            placeholder="初始密码"
            minLength={8}
            className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
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
            className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
          >
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? "创建中..." : "新增"}
          </button>
        </form>

        {loading ? (
          <div className="text-sm text-[#5d6b7a]">正在读取管理员账号...</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[#dde3ea]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#f8fafc] text-[#435364]">
                <tr>
                  <th className="px-4 py-3 font-medium">账号</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">最近登录</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dde3ea]">
                {adminUsers.map((adminUser) => (
                  <tr key={adminUser.id} className="bg-white">
                    <td className="px-4 py-3">
                      <div className="grid gap-1">
                        <span className="font-medium text-[#17202a]">
                          {adminUser.displayName || adminUser.email}
                          {adminUser.id === currentAdmin.id ? "（当前账号）" : ""}
                        </span>
                        <span className="text-xs text-[#5d6b7a]">{adminUser.email}</span>
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
                        className="rounded-md border border-[#dde3ea] px-2 py-1 text-sm"
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
                        className="rounded-md border border-[#dde3ea] px-2 py-1 text-sm"
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-[#5d6b7a]">
                      {adminUser.lastLoginAt
                        ? new Date(adminUser.lastLoginAt).toLocaleString("zh-CN")
                        : "未登录"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
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
