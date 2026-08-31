import type { ConnectorHealthState } from "@/server/features/connector-ingestion/types";

export function connectorHealthPollInterval(
  state: ConnectorHealthState | undefined,
): number | false {
  return state === "syncing" ? 2_000 : false;
}

export function formatConnectorTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatConnectorDate(value: string | null): string {
  if (!value) return "No data yet";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
