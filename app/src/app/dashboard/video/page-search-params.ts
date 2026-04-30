export type DashboardVideoSearchParams = {
  sessionId?: string;
  materialId?: string;
  materialReferenceId?: string;
  strategy?: string;
  testMode?: string;
};

export function normalizeDashboardVideoSearchParams(params: DashboardVideoSearchParams) {
  return {
    sessionId: params.sessionId ?? null,
    materialId: params.materialId ?? null,
    materialReferenceId: params.materialReferenceId ?? null,
    strategyTag: params.strategy ?? null,
  };
}
