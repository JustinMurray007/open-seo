export function computeActionProgress(summary: {
  total: number;
  doneCount: number;
  dismissedCount: number;
}): { actionable: number; percentage: number } {
  const actionable = Math.max(0, summary.total - summary.dismissedCount);
  const percentage =
    actionable > 0 ? Math.round((summary.doneCount / actionable) * 100) : 0;
  return { actionable, percentage: Math.min(100, Math.max(0, percentage)) };
}
