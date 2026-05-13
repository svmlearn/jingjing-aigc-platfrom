export type DashboardVideoSearchParams = {
  source?: string;
  sessionId?: string;
  dailyTaskId?: string;
  calendarItemId?: string;
  draftId?: string;
  variantId?: string;
  jobId?: string;
  materialId?: string;
  materialReferenceId?: string;
  strategyTag?: string;
  strategy?: string;
};

export function normalizeDashboardVideoSearchParams(params: DashboardVideoSearchParams) {
  return {
    source: params.source ?? null,
    sessionId: params.sessionId ?? null,
    dailyTaskId: params.dailyTaskId ?? null,
    calendarItemId: params.calendarItemId ?? null,
    draftId: params.draftId ?? null,
    variantId: params.variantId ?? null,
    jobId: params.jobId ?? null,
    materialId: params.materialId ?? null,
    materialReferenceId: params.materialReferenceId ?? null,
    strategyTag: params.strategyTag ?? params.strategy ?? null,
  };
}
