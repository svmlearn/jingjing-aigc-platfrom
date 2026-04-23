import { InvitationCodesAdminPage } from "@/components/platform-admin/platform-admin-content";
import type {
  PlatformAdminInvitationCodeFilters,
  PlatformAdminInvitationCodeStatusFilter,
  PlatformAdminInvitationCodeUsageFilter,
} from "@/contracts/platform-admin";
import { listPlatformInvitationCodes } from "@/lib/db/platform-admin-repository";

export const dynamic = "force-dynamic";

const validStatusFilters: PlatformAdminInvitationCodeStatusFilter[] = [
  "all",
  "active",
  "disabled",
  "redeemed",
  "expired",
];

const validUsageFilters: PlatformAdminInvitationCodeUsageFilter[] = [
  "all",
  "unused",
  "expiring",
];

function pickFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvitationCodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string | string[];
    q?: string | string[];
    status?: string | string[];
    usage?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const filters: PlatformAdminInvitationCodeFilters = {
    query: pickFirstValue(params.q)?.trim() || undefined,
    status: validStatusFilters.includes(
      pickFirstValue(params.status) as PlatformAdminInvitationCodeStatusFilter,
    )
      ? (pickFirstValue(params.status) as PlatformAdminInvitationCodeStatusFilter)
      : "all",
    usage: validUsageFilters.includes(
      pickFirstValue(params.usage) as PlatformAdminInvitationCodeUsageFilter,
    )
      ? (pickFirstValue(params.usage) as PlatformAdminInvitationCodeUsageFilter)
      : "all",
  };
  const invitationCodes = await listPlatformInvitationCodes(filters);
  const createdCode = pickFirstValue(params.created);

  return (
    <InvitationCodesAdminPage
      invitationCodes={invitationCodes}
      createdCode={createdCode}
      filters={filters}
    />
  );
}
