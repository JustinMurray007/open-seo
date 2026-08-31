import {
  ga4DateInTimeZone,
  shiftGa4Date,
} from "@/server/features/ga4/services/Ga4Dates";
import type { ConnectorDateRange } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MANUAL_DAYS = 90;

export class ConnectorDatePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorDatePolicyError";
  }
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function inclusiveDays(startDate: string, endDate: string): number {
  return (
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

function validateExplicitRange(input: {
  startDate?: string;
  endDate?: string;
  latestCompleteDate: string;
  floorDate?: string;
}): ConnectorDateRange | null {
  if (Boolean(input.startDate) !== Boolean(input.endDate)) {
    throw new ConnectorDatePolicyError(
      "Provide both startDate and endDate, or neither.",
    );
  }
  if (!input.startDate || !input.endDate) return null;
  if (
    !isValidDate(input.startDate) ||
    !isValidDate(input.endDate) ||
    input.startDate > input.endDate
  ) {
    throw new ConnectorDatePolicyError(
      "Dates must be valid YYYY-MM-DD values with startDate on or before endDate.",
    );
  }
  if (inclusiveDays(input.startDate, input.endDate) > MAX_MANUAL_DAYS) {
    throw new ConnectorDatePolicyError(
      "Connector sync date ranges cannot exceed 90 days.",
    );
  }
  if (input.endDate > input.latestCompleteDate) {
    throw new ConnectorDatePolicyError(
      "The end date must be a complete provider day.",
    );
  }
  if (input.floorDate && input.startDate < input.floorDate) {
    throw new ConnectorDatePolicyError(
      "Search Console sync dates must be within the last 16 months.",
    );
  }
  return {
    requestedStartDate: input.startDate,
    requestedEndDate: input.endDate,
    effectiveStartDate: input.startDate,
    effectiveEndDate: input.endDate,
  };
}

function sixteenMonthFloor(calendarDate: string): string {
  const now = new Date(`${calendarDate}T00:00:00.000Z`);
  const targetMonthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth() - 16;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastTargetMonthDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const floor = new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(now.getUTCDate(), lastTargetMonthDay),
    ),
  );
  return floor.toISOString().slice(0, 10);
}

export function latestCompleteGscDate(now: Date): string {
  return shiftGa4Date(ga4DateInTimeZone(now, "America/Los_Angeles"), -3);
}

export function latestCompleteGa4Date(now: Date, timeZone: string): string {
  return shiftGa4Date(ga4DateInTimeZone(now, timeZone), -1);
}

export function resolveGscSyncRange(input: {
  now: Date;
  lastCompleteDate: string | null;
  startDate?: string;
  endDate?: string;
}): ConnectorDateRange {
  const latestCompleteDate = latestCompleteGscDate(input.now);
  const floorDate = sixteenMonthFloor(
    ga4DateInTimeZone(input.now, "America/Los_Angeles"),
  );
  const explicit = validateExplicitRange({
    startDate: input.startDate,
    endDate: input.endDate,
    latestCompleteDate,
    floorDate,
  });
  if (explicit) return explicit;

  if (!input.lastCompleteDate) {
    return {
      requestedStartDate: null,
      requestedEndDate: null,
      effectiveStartDate:
        shiftGa4Date(latestCompleteDate, -27) < floorDate
          ? floorDate
          : shiftGa4Date(latestCompleteDate, -27),
      effectiveEndDate: latestCompleteDate,
    };
  }
  const incrementalStart =
    shiftGa4Date(input.lastCompleteDate, 1) < floorDate
      ? floorDate
      : shiftGa4Date(input.lastCompleteDate, 1);
  return {
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate:
      incrementalStart <= latestCompleteDate
        ? incrementalStart
        : shiftGa4Date(latestCompleteDate, -2),
    effectiveEndDate: latestCompleteDate,
  };
}

export function resolveGa4SyncRange(input: {
  now: Date;
  propertyTimeZone: string;
  lastCompleteDate: string | null;
  startDate?: string;
  endDate?: string;
}): ConnectorDateRange {
  const latestCompleteDate = latestCompleteGa4Date(
    input.now,
    input.propertyTimeZone,
  );
  const explicit = validateExplicitRange({
    startDate: input.startDate,
    endDate: input.endDate,
    latestCompleteDate,
  });
  if (explicit) return explicit;
  const incrementalStart = input.lastCompleteDate
    ? shiftGa4Date(input.lastCompleteDate, 1)
    : shiftGa4Date(latestCompleteDate, -27);
  return {
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate:
      incrementalStart <= latestCompleteDate
        ? incrementalStart
        : shiftGa4Date(latestCompleteDate, -2),
    effectiveEndDate: latestCompleteDate,
  };
}
