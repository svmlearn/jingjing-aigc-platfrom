import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Plus,
  Server,
  Settings2,
  ShieldBan,
  Sparkles,
  Store,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PlatformAdminInvitationCodeDto,
  PlatformAdminInvitationCodeFilters,
  PlatformAdminInvitationCodeStatusFilter,
  PlatformAdminInvitationCodeUsageFilter,
} from "@/contracts/platform-admin";
import { CreateInvitationCodeForm } from "@/components/platform-admin/create-invitation-code-form";
import { InvitationCodeStatusAction } from "@/components/platform-admin/invitation-code-status-action";
import {
  adminAlerts,
  adminAuditEvents,
  adminMerchants,
  adminOverviewMetrics,
  importRuntimeConfig,
  llmProviderConfigs,
  membershipPlanConfigs,
  type AdminAlertLevel,
  type AdminMerchant,
  type AdminMerchantStatus,
  type MerchantPlan,
} from "@/lib/ui/platform-admin-mock";

const metricToneClasses = {
  neutral: "text-[#17202a]",
  positive: "text-[#166534]",
  warning: "text-[#b45309]",
} as const;

const invitationToneClasses: Record<PlatformAdminInvitationCodeDto["status"], string> = {
  active: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  redeemed: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  expired: "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]",
  disabled: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]",
};

const merchantToneClasses: Record<AdminMerchantStatus, string> = {
  active: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  disabled: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]",
  archived: "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]",
};

const alertToneClasses: Record<AdminAlertLevel, string> = {
  critical: "border-[#fecaca] bg-[#fff1f2] text-[#be123c]",
  warning: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
};

const planToneClasses: Record<MerchantPlan, string> = {
  free: "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]",
  plus: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  pro: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
};

const invitationCodeStatusFilters: Array<{
  value: PlatformAdminInvitationCodeStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "可使用" },
  { value: "disabled", label: "已停用" },
  { value: "redeemed", label: "已用完" },
  { value: "expired", label: "已过期" },
];

const invitationCodeUsageFilters: Array<{
  value: PlatformAdminInvitationCodeUsageFilter;
  label: string;
}> = [
  { value: "all", label: "全部结果" },
  { value: "unused", label: "仅看未使用" },
  { value: "expiring", label: "即将过期" },
];

const adminDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
});

const adminDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAdminDate(value?: string | null) {
  if (!value) {
    return "不限";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return adminDateFormatter.format(date);
}

function formatAdminDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return adminDateTimeFormatter.format(date);
}

function buildInvitationCodeFilterHref(
  filters: PlatformAdminInvitationCodeFilters,
  next: Partial<PlatformAdminInvitationCodeFilters>,
) {
  const searchParams = new URLSearchParams();
  const query = next.query ?? filters.query;
  const status = next.status ?? filters.status ?? "all";
  const usage = next.usage ?? filters.usage ?? "all";

  if (query) {
    searchParams.set("q", query);
  }

  if (status !== "all") {
    searchParams.set("status", status);
  }

  if (usage !== "all") {
    searchParams.set("usage", usage);
  }

  const queryString = searchParams.toString();

  return `/platform-admin/invitation-codes${queryString ? `?${queryString}` : ""}`;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
      <div className="border-b border-[#dde3ea] pb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#5d6b7a]">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return <Badge className={`rounded-md ${className}`}>{label}</Badge>;
}

export function PlatformAdminOverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="总览"
        description="先看平台的运行状态，再区分业务摘要、管理员操作和系统告警。"
      />

      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {adminOverviewMetrics.map((metric) => (
            <article key={metric.label} className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
              <p className="text-sm text-[#5d6b7a]">{metric.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#17202a]">{metric.value}</p>
              <p className={`mt-2 text-sm ${metricToneClasses[metric.tone]}`}>{metric.delta}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="管理员操作日志" description="记录谁动了邀请码、商户状态和平台级配置。">
            <div className="overflow-hidden rounded-md border border-[#dde3ea]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#f8fafc]">
                    <TableHead>时间</TableHead>
                    <TableHead>操作人</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>事件</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminAuditEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.happenedAt}</TableCell>
                      <TableCell>{event.actorName}</TableCell>
                      <TableCell>{event.type}</TableCell>
                      <TableCell>{event.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title="系统告警" description="这些不是管理员操作，而是平台当前需要跟进的异常信号。">
            <div className="grid gap-3">
              {adminAlerts.map((alert) => (
                <article key={alert.id} className={`rounded-md border px-4 py-3 ${alertToneClasses[alert.level]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="mt-1 text-sm leading-6">{alert.description}</p>
                    </div>
                    <span className="shrink-0 text-xs">{alert.happenedAt}</span>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export function InvitationCodesAdminPage({
  invitationCodes,
  createdCode,
  filters,
  canManageInvitationCodes,
}: {
  invitationCodes: PlatformAdminInvitationCodeDto[];
  createdCode?: string;
  filters: PlatformAdminInvitationCodeFilters;
  canManageInvitationCodes: boolean;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="邀请码管理"
        description="这里展示真实邀请码记录。生成成功后会直接回到列表，不再停留在只会展示 mock 的壳子里。"
        action={
          canManageInvitationCodes ? (
            <Button asChild className="h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
              <Link href="/platform-admin/invitation-codes/new">
                <Plus className="size-4" />
                生成邀请码
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SectionCard title="邀请码列表" description="按创建时间倒序展示，名称字段就是你创建时填写的内部备注。">
        {!canManageInvitationCodes ? (
          <div className="mb-4 rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
            当前 admin 角色只能查看邀请码；生成、停用和重新启用邀请码需要 super_admin。
          </div>
        ) : null}

        {createdCode ? (
          <div className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
            邀请码 <span className="font-semibold">{createdCode}</span> 已生成，现在可以直接复制给要注册的商家。
          </div>
        ) : null}

        <div className="mb-4 grid gap-4 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
          <form action="/platform-admin/invitation-codes" className="grid gap-3 md:grid-cols-[1fr_auto]">
            {(filters.status ?? "all") !== "all" ? (
              <input type="hidden" name="status" value={filters.status} />
            ) : null}
            {(filters.usage ?? "all") !== "all" ? (
              <input type="hidden" name="usage" value={filters.usage} />
            ) : null}
            <Input
              name="q"
              defaultValue={filters.query ?? ""}
              placeholder="搜索邀请码或渠道备注"
            />
            <Button type="submit" variant="outline" className="rounded-md">
              搜索
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {invitationCodeStatusFilters.map((filter) => {
              const active = (filters.status ?? "all") === filter.value;

              return (
                <Button
                  key={filter.value}
                  asChild
                  variant="outline"
                  className={`rounded-md ${active ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]" : ""}`}
                >
                  <Link
                    href={buildInvitationCodeFilterHref(filters, {
                      status: filter.value,
                    })}
                  >
                    {filter.label}
                  </Link>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {invitationCodeUsageFilters.map((filter) => {
              const active = (filters.usage ?? "all") === filter.value;

              return (
                <Button
                  key={filter.value}
                  asChild
                  variant="outline"
                  className={`rounded-md ${active ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]" : ""}`}
                >
                  <Link
                    href={buildInvitationCodeFilterHref(filters, {
                      usage: filter.value,
                    })}
                  >
                    {filter.label}
                  </Link>
                </Button>
              );
            })}

            <Button asChild variant="outline" className="rounded-md">
              <Link href="/platform-admin/invitation-codes">清空筛选</Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#dde3ea]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f8fafc]">
                <TableHead>邀请码</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>使用情况</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>过期时间</TableHead>
                <TableHead>名称 / 渠道备注</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitationCodes.length > 0 ? (
                invitationCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-medium">{code.code}</TableCell>
                    <TableCell>
                      <StatusBadge label={code.status} className={invitationToneClasses[code.status]} />
                    </TableCell>
                    <TableCell>
                      {code.redemptionCount} / {code.maxRedemptions}
                    </TableCell>
                    <TableCell>{formatAdminDateTime(code.createdAt)}</TableCell>
                    <TableCell>{formatAdminDate(code.expiresAt)}</TableCell>
                    <TableCell>{code.note ?? "未命名"}</TableCell>
                    <TableCell>
                      <InvitationCodeStatusAction
                        invitationCode={code}
                        canManage={canManageInvitationCodes}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-[#5d6b7a]">
                    还没有创建过邀请码。现在可以直接去生成第一条真实邀请码记录。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

export function CreateInvitationCodeAdminPage() {
  return <CreateInvitationCodeForm />;
}

function MerchantPlanBadge({ plan }: { plan: MerchantPlan }) {
  return <StatusBadge label={plan} className={planToneClasses[plan]} />;
}

function MerchantStatusBadge({ status }: { status: AdminMerchantStatus }) {
  return <StatusBadge label={status} className={merchantToneClasses[status]} />;
}

export function MerchantsAdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="商户管理"
        description="这里看商户启停、会员等级和今日剩余积分。后续接真实额度系统时，这页会成为最重要的运营入口之一。"
      />

      <SectionCard title="商户列表" description="先以商户维度看状态、套餐和活跃度，细节再进详情。">
        <div className="overflow-hidden rounded-md border border-[#dde3ea]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f8fafc]">
                <TableHead>商户名</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>会员等级</TableHead>
                <TableHead>今日剩余积分</TableHead>
                <TableHead>最近活跃</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminMerchants.map((merchant) => (
                <TableRow key={merchant.id}>
                  <TableCell className="font-medium">{merchant.name}</TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      <span>{merchant.ownerName}</span>
                      <span className="text-xs text-[#5d6b7a]">{merchant.ownerEmail}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <MerchantStatusBadge status={merchant.status} />
                  </TableCell>
                  <TableCell>
                    <MerchantPlanBadge plan={merchant.plan} />
                  </TableCell>
                  <TableCell>
                    {merchant.remainingCredits} / {merchant.dailyCredits}
                  </TableCell>
                  <TableCell>{merchant.lastActiveAt}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" className="rounded-md" asChild>
                      <Link href={`/platform-admin/merchants/${merchant.id}`}>详情</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

function MerchantSummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <article className="rounded-md border border-[#dde3ea] bg-white p-4">
      <div className="flex items-center gap-2 text-[#5d6b7a]">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-[#17202a]">{value}</p>
    </article>
  );
}

export function MerchantDetailAdminPage({ merchant }: { merchant: AdminMerchant }) {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title={merchant.name}
        description="商户详情页聚合基础信息、状态切换、会员等级和最近任务概况。当前为演示数据，后续接真实商户与积分模型。"
        action={
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/platform-admin/merchants">
              <ArrowLeft className="size-4" />
              返回商户管理
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MerchantSummaryCard icon={<Sparkles className="size-4" />} label="今日改写" value={merchant.todayRewrites} />
          <MerchantSummaryCard icon={<Clock3 className="size-4" />} label="运行中任务" value={merchant.runningTasks} />
          <MerchantSummaryCard icon={<ShieldBan className="size-4" />} label="失败任务" value={merchant.failedTasks} />
          <MerchantSummaryCard icon={<Store className="size-4" />} label="剩余积分" value={`${merchant.remainingCredits} / ${merchant.dailyCredits}`} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <SectionCard title="商户基础信息" description="后续这里会接真实 merchant_profiles 与 owner 信息。">
            <dl className="grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-sm text-[#5d6b7a]">Owner</dt>
                <dd className="mt-1 font-medium">{merchant.ownerName}</dd>
                <dd className="text-sm text-[#5d6b7a]">{merchant.ownerEmail}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#5d6b7a]">联系电话</dt>
                <dd className="mt-1 font-medium">{merchant.contactPhone}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#5d6b7a]">地址</dt>
                <dd className="mt-1 font-medium">{merchant.address}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#5d6b7a]">加入时间</dt>
                <dd className="mt-1 font-medium">{merchant.joinedAt}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-sm text-[#5d6b7a]">服务范围</dt>
                <dd className="mt-1 font-medium">{merchant.serviceSummary}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-sm text-[#5d6b7a]">运营备注</dt>
                <dd className="mt-1 font-medium">{merchant.note}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="状态与会员策略" description="这部分 UI 已补齐，但真实生效还需要接商户状态和积分规则表。">
            <div className="grid gap-5">
              <div>
                <p className="text-sm font-medium">状态切换</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" className="rounded-md border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]">
                    <CheckCircle2 className="size-4" />
                    启用
                  </Button>
                  <Button variant="outline" className="rounded-md">
                    <ShieldBan className="size-4" />
                    禁用
                  </Button>
                  <Button variant="outline" className="rounded-md">
                    归档
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">会员等级</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {membershipPlanConfigs.map((plan) => (
                    <Button
                      key={plan.plan}
                      variant="outline"
                      className={`rounded-md ${merchant.plan === plan.plan ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]" : ""}`}
                    >
                      {plan.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <p className="text-sm font-medium">积分规则摘要</p>
                <p className="mt-2 text-sm leading-6 text-[#5d6b7a]">
                  当前商户为 <span className="font-medium text-[#17202a]">{merchant.plan}</span> 档，每日默认{" "}
                  <span className="font-medium text-[#17202a]">{merchant.dailyCredits}</span> 点，
                  当前剩余 <span className="font-medium text-[#17202a]">{merchant.remainingCredits}</span> 点。
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="最近任务概况" description="先用任务摘要替代完整作业中心，避免管理台首页过早膨胀。">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
              <p className="text-sm text-[#5d6b7a]">累计导入</p>
              <p className="mt-2 text-2xl font-semibold">{merchant.totalImports}</p>
            </article>
            <article className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
              <p className="text-sm text-[#5d6b7a]">累计草稿</p>
              <p className="mt-2 text-2xl font-semibold">{merchant.totalDrafts}</p>
            </article>
            <article className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
              <p className="text-sm text-[#5d6b7a]">最近活跃</p>
              <p className="mt-2 text-2xl font-semibold">{merchant.lastActiveAt}</p>
            </article>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

export function PlatformSettingsAdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="系统配置"
        description="把平台级 LLM Provider、导入默认值和会员积分规则都放在这里。机密值先只做掩码展示。"
      />

      <div className="grid gap-6">
        <SectionCard title="LLM Provider 配置" description="这部分是平台级统一配置，不放到商户工作台里。">
          <div className="grid gap-4 xl:grid-cols-2">
            {llmProviderConfigs.map((provider) => (
              <article key={provider.id} className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{provider.name}</h3>
                    <p className="mt-1 text-sm text-[#5d6b7a]">{provider.providerLabel}</p>
                  </div>
                  <StatusBadge
                    label={provider.enabled ? "启用中" : "备用"}
                    className={provider.enabled ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]" : "border-[#e2e8f0] bg-white text-[#475569]"}
                  />
                </div>

                <dl className="mt-4 grid gap-3 text-sm">
                  <div className="grid gap-1">
                    <dt className="text-[#5d6b7a]">Base URL</dt>
                    <dd className="font-medium">{provider.baseUrl}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-[#5d6b7a]">API Key</dt>
                    <dd className="font-medium">{provider.apiKeyMasked}</dd>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <dt className="text-[#5d6b7a]">默认主模型</dt>
                      <dd className="mt-1 font-medium">{provider.primaryModel}</dd>
                    </div>
                    <div>
                      <dt className="text-[#5d6b7a]">备用模型</dt>
                      <dd className="mt-1 font-medium">{provider.fallbackModel}</dd>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <dt className="text-[#5d6b7a]">temperature</dt>
                      <dd className="mt-1 font-medium">{provider.temperature}</dd>
                    </div>
                    <div>
                      <dt className="text-[#5d6b7a]">max tokens</dt>
                      <dd className="mt-1 font-medium">{provider.maxTokens}</dd>
                    </div>
                    <div>
                      <dt className="text-[#5d6b7a]">timeout</dt>
                      <dd className="mt-1 font-medium">{provider.timeoutSeconds}s</dd>
                    </div>
                    <div>
                      <dt className="text-[#5d6b7a]">重试次数</dt>
                      <dd className="mt-1 font-medium">{provider.retryCount}</dd>
                    </div>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="导入默认值" description="这些值和当前环境变量思路保持一致，后续可切到真正配置表。">
            <div className="grid gap-4">
              <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <div className="flex items-center gap-2 text-[#5d6b7a]">
                  <Server className="size-4" />
                  <p className="text-sm font-medium">导入 Provider</p>
                </div>
                <p className="mt-2 text-xl font-semibold">{importRuntimeConfig.importProvider}</p>
              </div>
              <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <p className="text-sm text-[#5d6b7a]">默认评论抓取数</p>
                <p className="mt-2 text-xl font-semibold">{importRuntimeConfig.defaultMaxComments}</p>
              </div>
              <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <p className="text-sm text-[#5d6b7a]">主页默认抓取条数</p>
                <p className="mt-2 text-xl font-semibold">{importRuntimeConfig.defaultCreatorPosts}</p>
              </div>
              <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                <p className="text-sm text-[#5d6b7a]">Apify 等待时长</p>
                <p className="mt-2 text-xl font-semibold">{importRuntimeConfig.waitSeconds}s</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="会员与积分规则" description="先按套餐默认值配置，后续再加单商户覆写。">
            <div className="grid gap-4">
              {membershipPlanConfigs.map((plan) => (
                <article key={plan.plan} className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Settings2 className="size-4 text-[#0f766e]" />
                        <h3 className="font-semibold">{plan.label}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#5d6b7a]">{plan.description}</p>
                    </div>
                    <div className="rounded-md border border-[#dde3ea] bg-white px-4 py-3 text-center">
                      <p className="text-xs text-[#5d6b7a]">每日积分</p>
                      <p className="mt-1 text-2xl font-semibold text-[#17202a]">{plan.dailyCredits}</p>
                    </div>
                  </div>
                </article>
              ))}

              <div className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm leading-6 text-[#1d4ed8]">
                当前先按 <span className="font-medium">1 次改写 = 1 点</span> 理解。后续如果要区分导入积分、改写积分或按模型成本扣点，
                这块可以继续往下拆，不需要推翻页面结构。
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
