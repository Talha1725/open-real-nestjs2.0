const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  LIVE: 'Live',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  CHANGES_REQUESTED: 'Changes Requested',
};

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'info',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  LIVE: 'success',
  REJECTED: 'error',
  CLOSED: 'info',
  CHANGES_REQUESTED: 'warning',
};

export function appendStatusHistory(
  existing: unknown,
  status: string,
): { status: string; timestamp: string }[] {
  const history = Array.isArray(existing) ? [...existing] : [];
  history.push({ status, timestamp: new Date().toISOString() });
  return history;
}

export function buildStatusTimeline(statusHistory: unknown) {
  const entries = Array.isArray(statusHistory) ? statusHistory : [];
  return entries.map((entry: { status: string; timestamp: string }) => {
    const d = new Date(entry.timestamp);
    return {
      label: STATUS_LABELS[entry.status] ?? entry.status,
      date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
      tone: STATUS_TONES[entry.status] ?? 'info',
    };
  });
}
