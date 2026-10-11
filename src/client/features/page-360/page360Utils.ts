const STATUS_TEXT: Record<number, string> = {
  200: "200 OK",
  201: "201 Created",
  204: "204 No Content",
  301: "301 Permanent Redirect",
  302: "302 Temporary Redirect",
  304: "304 Not Modified",
  307: "307 Temporary Redirect",
  308: "308 Permanent Redirect",
  400: "400 Bad Request",
  401: "401 Unauthorized",
  403: "403 Forbidden",
  404: "404 Not Found",
  410: "410 Gone",
  429: "429 Rate Limited",
  500: "500 Internal Error",
  502: "502 Bad Gateway",
  503: "503 Unavailable",
  504: "504 Gateway Timeout",
};

export function formatStatusCode(code: number | null): string {
  if (code === null) return "Not Audited";
  return STATUS_TEXT[code] ?? `${code} Status`;
}

export function getStatusCodeBadgeClass(code: number | null): string {
  if (code === null) return "badge-ghost";
  if (code >= 200 && code < 300) return "badge-success text-success-content";
  if (code >= 300 && code < 400) return "badge-warning text-warning-content";
  return "badge-error text-error-content";
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

export function formatCtr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined || value <= 0) return "—";
  return value.toFixed(1);
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return Math.round(score).toString();
}

export function getScoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-base-content/40";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}

export function cleanDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}
