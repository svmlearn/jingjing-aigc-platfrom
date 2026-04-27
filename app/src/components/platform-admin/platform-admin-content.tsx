import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
  ShieldBan,
  Sparkles,
  Store,
  Ticket,
  Users,
  WalletCards,
} from "lucide-react";

import { CreateInvitationCodeForm } from "@/components/platform-admin/create-invitation-code-form";
import { InvitationCodeStatusAction } from "@/components/platform-admin/invitation-code-status-action";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStatusBadge,
  adminButtonClassName,
  adminButtonVariants,
  adminInputClassName,
} from "@/components/platform-admin/platform-admin-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AgentConsoleFoundationStateDto,
  PlatformAdminInvitationCodeDto,
  PlatformAdminInvitationCodeFilters,
  PlatformAdminInvitationCodeStatusFilter,
  PlatformAdminInvitationCodeUsageFilter,
} from "@/contracts/platform-admin";
import { cn } from "@/lib/utils";
import {
  adminAlerts,
  adminAuditEvents,
  adminMerchants,
  type AdminAlertLevel,
  type AdminMerchant,
  type AdminMerchantStatus,
  type MerchantPlan,
} from "@/lib/ui/platform-admin-mock";

const metricToneClasses = {
  neutral: "text-white",
  positive: "text-emerald-300",
  warning: "text-amber-300",
  sky: "text-sky-300",
  violet: "text-violet-300",
} as const;

const alertToneClasses: Record<AdminAlertLevel, string> = {
  critical: "border-red-500/25 bg-red-950/35 text-red-200/85",
  warning: "border-amber-500/25 bg-amber-500/[0.08] text-amber-200/85",
  info: "border-sky-500/20 bg-sky-500/[0.07] text-sky-200/80",
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

function tableHeadClassName(className?: string) {
  return cn(
    "h-11 px-5 text-[10px] font-medium uppercase tracking-widest text-white/35",
    className,
  );
}

function tableCellClassName(className?: string) {
  return cn("px-5 py-3 text-sm text-white/55", className);
}

function AdminActionLink({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof adminButtonVariants;
}) {
  return (
    <Link
      href={href}
      className={cn(adminButtonClassName, adminButtonVariants[variant])}
    >
      {children}
    </Link>
  );
}

function ToggleLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-8 items-center rounded-md border px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80",
        active
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      {children}
    </Link>
  );
}

function MerchantPlanBadge({ plan }: { plan: MerchantPlan }) {
  return <AdminStatusBadge status={plan} />;
}

function MerchantStatusBadge({ status }: { status: AdminMerchantStatus }) {
  return <AdminStatusBadge status={status} />;
}

function getOnlineAgent(foundationState?: AgentConsoleFoundationStateDto) {
  const onlineBinding = foundationState?.routeBindings.find(
    (binding) => binding.routeKey === "consultation_default" && binding.status === "active",
  );

  return foundationState?.agents.find((agent) => agent.id === onlineBinding?.agentId) ?? null;
}

export function PlatformAdminOverviewPage({
  foundationState,
}: {
  foundationState?: AgentConsoleFoundationStateDto;
}) {
  const onlineAgent = getOnlineAgent(foundationState);
  const enabledSkillCount =
    foundationState?.skills.filter((skill) => skill.status === "enabled").length ?? 0;
  const enabledKnowledgeSetCount =
    foundationState?.knowledgeSets.filter((set) => set.status === "enabled").length ?? 0;
  const stats = [
    {
      label: "商户总数",
      value: adminMerchants.length,
      sub: "当前运营样本",
      tone: "neutral",
    },
    {
      label: "线上 Agent",
      value: onlineAgent ? 1 : 0,
      sub: onlineAgent?.displayName ?? "未绑定",
      tone: onlineAgent ? "warning" : "neutral",
    },
    {
      label: "已启用技能",
      value: enabledSkillCount,
      sub: `共 ${foundationState?.skills.length ?? 0} 个技能`,
      tone: "positive",
    },
    {
      label: "知识集",
      value: foundationState?.knowledgeSets.length ?? 0,
      sub: `${enabledKnowledgeSetCount} 个已启用`,
      tone: "sky",
    },
    {
      label: "本月咨询",
      value: 194,
      sub: "运行快照分支接入后替换",
      tone: "neutral",
    },
    {
      label: "积分消耗",
      value: "4,280",
      sub: "会员积分底座预留",
      tone: "violet",
    },
  ] satisfies Array<{
    label: string;
    value: number | string;
    sub: string;
    tone: keyof typeof metricToneClasses;
  }>;

  const systemRows = [
    {
      label: "线上咨询 Agent",
      value: onlineAgent?.displayName ?? "未配置",
      ok: Boolean(onlineAgent),
    },
    {
      label: "Agent 生命周期",
      value: onlineAgent?.serviceStatus ?? "unknown",
      ok: onlineAgent?.serviceStatus === "enabled",
    },
    {
      label: "知识检索",
      value: enabledKnowledgeSetCount > 0 ? "服务正常" : "暂无启用知识集",
      ok: enabledKnowledgeSetCount > 0,
    },
    {
      label: "积分 Gate",
      value: "已预留",
      ok: true,
    },
  ];

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="总览"
        description="先看平台运行状态，再进入运营管理、Agent 能力和系统配置。V2.2 的 Agent foundation 数据在这里做只读汇总。"
      />

      {adminAlerts.length > 0 ? (
        <div className="grid gap-2">
          {adminAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                alertToneClasses[alert.level],
              )}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">{alert.title}</p>
                <p className="mt-1 leading-6 opacity-80">{alert.description}</p>
              </div>
              <span className="ml-auto shrink-0 text-xs opacity-60">{alert.happenedAt}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((metric) => (
          <AdminPanel key={metric.label} className="p-5">
            <p className="text-sm text-white/45">{metric.label}</p>
            <p className={cn("mt-2 text-3xl font-semibold", metricToneClasses[metric.tone])}>
              {metric.value}
            </p>
            <p className="mt-2 truncate text-xs text-white/35">{metric.sub}</p>
          </AdminPanel>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminPanel>
          <AdminPanelHeader eyebrow="系统状态" />
          <div className="grid gap-3 p-5">
            {systemRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/45">{row.label}</span>
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-1.5",
                    row.ok ? "text-emerald-300" : "text-amber-300",
                  )}
                >
                  {row.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate text-xs">{row.value}</span>
                </div>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader
            eyebrow="操作日志"
            action={<span className="text-[10px] text-white/30">今日</span>}
          />
          <div className="grid gap-1 p-2">
            {adminAuditEvents.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] gap-3 rounded-md px-3 py-2 text-xs transition-colors hover:bg-white/[0.04]"
              >
                <span className="font-mono text-white/30">{event.happenedAt}</span>
                <span className="text-amber-300/80">{event.type}</span>
                <span className="truncate text-white/45">{event.summary}</span>
              </div>
            ))}
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

export function InvitationCodesAdminPage({
  invitationCodes,
  createdCode,
  filters,
}: {
  invitationCodes: PlatformAdminInvitationCodeDto[];
  createdCode?: string;
  filters: PlatformAdminInvitationCodeFilters;
}) {
  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="邀请码管理"
        description="邀请码列表读取真实平台记录。创建、启停操作继续走现有 API，不在 UI 层做假状态。"
        action={
          <AdminActionLink href="/platform-admin/invitation-codes/new" variant="primary">
            <Plus className="size-3.5" aria-hidden="true" />
            新建邀请码
          </AdminActionLink>
        }
      />

      {createdCode ? (
        <AdminNotice tone="success">
          邀请码 <span className="font-mono font-semibold">{createdCode}</span> 已生成，现在可以复制给要注册的商家。
        </AdminNotice>
      ) : null}

      <AdminPanel>
        <AdminPanelHeader
          eyebrow="邀请码列表"
          action={<span className="text-xs text-white/30">{invitationCodes.length} 条记录</span>}
        />
        <div className="grid gap-4 border-b border-white/[0.06] p-4">
          <form action="/platform-admin/invitation-codes" className="grid gap-3 md:grid-cols-[1fr_auto]">
            {(filters.status ?? "all") !== "all" ? (
              <input type="hidden" name="status" value={filters.status} />
            ) : null}
            {(filters.usage ?? "all") !== "all" ? (
              <input type="hidden" name="usage" value={filters.usage} />
            ) : null}
            <input
              name="q"
              defaultValue={filters.query ?? ""}
              placeholder="搜索邀请码或渠道备注"
              className={adminInputClassName}
            />
            <button
              type="submit"
              className={cn(adminButtonClassName, adminButtonVariants.secondary)}
            >
              <Search className="size-3.5" aria-hidden="true" />
              搜索
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {invitationCodeStatusFilters.map((filter) => (
              <ToggleLink
                key={filter.value}
                href={buildInvitationCodeFilterHref(filters, { status: filter.value })}
                active={(filters.status ?? "all") === filter.value}
              >
                {filter.label}
              </ToggleLink>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {invitationCodeUsageFilters.map((filter) => (
              <ToggleLink
                key={filter.value}
                href={buildInvitationCodeFilterHref(filters, { usage: filter.value })}
                active={(filters.usage ?? "all") === filter.value}
              >
                {filter.label}
              </ToggleLink>
            ))}
            <ToggleLink href="/platform-admin/invitation-codes" active={false}>
              清空筛选
            </ToggleLink>
          </div>
        </div>

        {invitationCodes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className={tableHeadClassName()}>邀请码</TableHead>
                <TableHead className={tableHeadClassName()}>状态</TableHead>
                <TableHead className={tableHeadClassName()}>使用量</TableHead>
                <TableHead className={tableHeadClassName()}>创建时间</TableHead>
                <TableHead className={tableHeadClassName()}>过期时间</TableHead>
                <TableHead className={tableHeadClassName("min-w-52")}>名称 / 渠道备注</TableHead>
                <TableHead className={tableHeadClassName()}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitationCodes.map((code) => (
                <TableRow
                  key={code.id}
                  className="border-white/[0.06] hover:bg-white/[0.03]"
                >
                  <TableCell className={tableCellClassName("font-mono font-medium text-white/80")}>
                    {code.code}
                  </TableCell>
                  <TableCell className={tableCellClassName()}>
                    <AdminStatusBadge status={code.status} label={code.status} />
                  </TableCell>
                  <TableCell className={tableCellClassName("font-mono")}>
                    <span
                      className={cn(
                        code.redemptionCount >= code.maxRedemptions
                          ? "text-red-300"
                          : "text-white/70",
                      )}
                    >
                      {code.redemptionCount}
                    </span>
                    <span className="text-white/28"> / {code.maxRedemptions}</span>
                  </TableCell>
                  <TableCell className={tableCellClassName("font-mono text-xs")}>
                    {formatAdminDateTime(code.createdAt)}
                  </TableCell>
                  <TableCell className={tableCellClassName("font-mono text-xs")}>
                    {formatAdminDate(code.expiresAt)}
                  </TableCell>
                  <TableCell className={tableCellClassName("max-w-64 whitespace-normal text-white/45")}>
                    {code.note ?? "未命名"}
                  </TableCell>
                  <TableCell className={tableCellClassName()}>
                    <InvitationCodeStatusAction invitationCode={code} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <AdminEmptyState
              icon={Ticket}
              title="还没有邀请码"
              description="现在可以生成第一条真实邀请码记录，创建后会立即写入平台邀请码表。"
              action={
                <AdminActionLink href="/platform-admin/invitation-codes/new" variant="primary">
                  <Plus className="size-3.5" aria-hidden="true" />
                  新建邀请码
                </AdminActionLink>
              }
            />
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

export function CreateInvitationCodeAdminPage() {
  return <CreateInvitationCodeForm />;
}

export function MerchantsAdminPage() {
  const previewMerchant = adminMerchants[0];

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="商户管理"
        description="按商户维度查看状态、会员档位、积分余额和咨询活跃度。当前商户列表仍在 UI adapter 边界，后续接真实商户/会员 contract。"
        action={<span className="text-xs text-white/30">{adminMerchants.length} 个商户</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <AdminPanel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className={tableHeadClassName("min-w-44")}>商户名称</TableHead>
                <TableHead className={tableHeadClassName()}>会员档位</TableHead>
                <TableHead className={tableHeadClassName()}>状态</TableHead>
                <TableHead className={tableHeadClassName()}>积分余额</TableHead>
                <TableHead className={tableHeadClassName()}>咨询次数</TableHead>
                <TableHead className={tableHeadClassName()}>加入时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminMerchants.map((merchant) => (
                <TableRow
                  key={merchant.id}
                  className="border-white/[0.06] hover:bg-white/[0.03]"
                >
                  <TableCell className={tableCellClassName("font-medium text-white/85")}>
                    <Link
                      href={`/platform-admin/merchants/${merchant.id}`}
                      className="underline-offset-4 hover:text-amber-300 hover:underline"
                    >
                      {merchant.name}
                    </Link>
                    <div className="mt-1 truncate text-xs text-white/30">{merchant.ownerEmail}</div>
                  </TableCell>
                  <TableCell className={tableCellClassName()}>
                    <MerchantPlanBadge plan={merchant.plan} />
                  </TableCell>
                  <TableCell className={tableCellClassName()}>
                    <MerchantStatusBadge status={merchant.status} />
                  </TableCell>
                  <TableCell className={tableCellClassName("font-mono")}>
                    {merchant.remainingCredits.toLocaleString()}
                    <span className="text-white/28"> / {merchant.dailyCredits}</span>
                  </TableCell>
                  <TableCell className={tableCellClassName()}>
                    {merchant.totalDrafts + merchant.totalImports}
                  </TableCell>
                  <TableCell className={tableCellClassName("font-mono text-xs")}>
                    {merchant.joinedAt}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminPanel>

        {previewMerchant ? (
          <AdminPanel>
            <AdminPanelHeader eyebrow="商户详情" />
            <div className="grid gap-5 p-5">
              <div>
                <div className="mb-2 truncate text-base font-semibold text-white">
                  {previewMerchant.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  <MerchantPlanBadge plan={previewMerchant.plan} />
                  <MerchantStatusBadge status={previewMerchant.status} />
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                {[
                  { label: "Owner", value: previewMerchant.ownerName },
                  { label: "积分余额", value: `${previewMerchant.remainingCredits} / ${previewMerchant.dailyCredits}` },
                  { label: "最近活跃", value: previewMerchant.lastActiveAt },
                  { label: "服务范围", value: previewMerchant.serviceSummary },
                ].map((row) => (
                  <div key={row.label} className="min-w-0">
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-white/35">
                      {row.label}
                    </p>
                    <p className="break-words text-white/65">{row.value}</p>
                  </div>
                ))}
              </div>
              <AdminActionLink href={`/platform-admin/merchants/${previewMerchant.id}`}>
                查看完整详情
              </AdminActionLink>
            </div>
          </AdminPanel>
        ) : (
          <AdminEmptyState
            icon={Users}
            title="选择商户查看详情"
            className="min-h-full"
          />
        )}
      </div>
    </div>
  );
}

function MerchantSummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string | number;
}) {
  return (
    <AdminPanel className="p-4">
      <div className="flex items-center gap-2 text-white/40">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </AdminPanel>
  );
}

export function MerchantDetailAdminPage({ merchant }: { merchant: AdminMerchant }) {
  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title={merchant.name}
        description="商户详情聚合基础信息、会员积分和最近任务概况。状态切换操作先保持权限禁用态，等待商户 API 分支接入。"
        action={
          <AdminActionLink href="/platform-admin/merchants">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            返回商户管理
          </AdminActionLink>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MerchantSummaryTile icon={Sparkles} label="今日改写" value={merchant.todayRewrites} />
        <MerchantSummaryTile icon={Clock3} label="运行中任务" value={merchant.runningTasks} />
        <MerchantSummaryTile icon={ShieldBan} label="失败任务" value={merchant.failedTasks} />
        <MerchantSummaryTile
          icon={WalletCards}
          label="剩余积分"
          value={`${merchant.remainingCredits} / ${merchant.dailyCredits}`}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <AdminPanel>
          <AdminPanelHeader eyebrow="商户基础信息" />
          <dl className="grid gap-4 p-5 md:grid-cols-2">
            {[
              { label: "Owner", value: merchant.ownerName, sub: merchant.ownerEmail },
              { label: "联系电话", value: merchant.contactPhone },
              { label: "地址", value: merchant.address },
              { label: "加入时间", value: merchant.joinedAt },
              { label: "服务范围", value: merchant.serviceSummary, wide: true },
              { label: "运营备注", value: merchant.note, wide: true },
            ].map((row) => (
              <div key={row.label} className={cn("min-w-0", row.wide && "md:col-span-2")}>
                <dt className="text-[10px] font-medium uppercase tracking-widest text-white/35">
                  {row.label}
                </dt>
                <dd className="mt-2 break-words text-sm font-medium text-white/75">{row.value}</dd>
                {"sub" in row && row.sub ? (
                  <dd className="mt-1 break-words text-sm text-white/35">{row.sub}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader eyebrow="状态与会员策略" />
          <div className="grid gap-5 p-5">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/35">
                状态切换
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(adminButtonClassName, adminButtonVariants.secondary)}
                  disabled
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  启用
                </button>
                <button
                  type="button"
                  className={cn(adminButtonClassName, adminButtonVariants.danger)}
                  disabled
                >
                  <ShieldBan className="size-3.5" aria-hidden="true" />
                  禁用
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/35">
                会员档位
              </p>
              <div className="flex flex-wrap gap-2">
                {(["free", "plus", "pro"] satisfies MerchantPlan[]).map((plan) => (
                  <span
                    key={plan}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs font-medium uppercase tracking-widest",
                      merchant.plan === plan
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : "border-white/10 bg-white/[0.04] text-white/35",
                    )}
                  >
                    {plan}
                  </span>
                ))}
              </div>
            </div>

            <AdminNotice tone="info">
              当前商户为 <span className="font-medium text-white">{merchant.plan}</span> 档，每日默认{" "}
              <span className="font-medium text-white">{merchant.dailyCredits}</span> 点。
              这里是权限禁用态，等商户状态和积分规则 API 接入后再开放写操作。
            </AdminNotice>
          </div>
        </AdminPanel>
      </div>

      <AdminPanel>
        <AdminPanelHeader eyebrow="最近任务概况" />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {[
            { label: "累计导入", value: merchant.totalImports, icon: Store },
            { label: "累计草稿", value: merchant.totalDrafts, icon: Sparkles },
            { label: "最近活跃", value: merchant.lastActiveAt, icon: Clock3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 border-l border-white/10 pl-4">
              <Icon className="size-4 text-white/35" aria-hidden="true" />
              <div>
                <p className="text-sm text-white/40">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white/80">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}
