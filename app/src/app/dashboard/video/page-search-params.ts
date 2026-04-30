export type DashboardVideoSearchParams = {
  source?: string;
  sessionId?: string;
  calendarItemId?: string;
  draftId?: string;
  variantId?: string;
  jobId?: string;
  materialId?: string;
  materialReferenceId?: string;
  strategyTag?: string;
  strategy?: string;
  testMode?: string;
};

export function normalizeDashboardVideoSearchParams(params: DashboardVideoSearchParams) {
  return {
    source: params.source ?? null,
    sessionId: params.sessionId ?? null,
    calendarItemId: params.calendarItemId ?? null,
    draftId: params.draftId ?? null,
    variantId: params.variantId ?? null,
    jobId: params.jobId ?? null,
    materialId: params.materialId ?? null,
    materialReferenceId: params.materialReferenceId ?? null,
    strategyTag: params.strategyTag ?? params.strategy ?? null,
    testMode: params.testMode ?? null,
  };
}
