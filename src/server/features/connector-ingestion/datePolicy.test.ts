import { describe, expect, it } from "vitest";
import {
  ConnectorDatePolicyError,
  resolveGa4SyncRange,
  resolveGscSyncRange,
} from "./datePolicy";

const NOW = new Date("2026-08-31T04:14:00.000Z");

describe("connector date policy", () => {
  it("uses 28 GSC days ending three days ago on first sync", () => {
    expect(
      resolveGscSyncRange({ now: NOW, lastCompleteDate: null }),
    ).toMatchObject({
      effectiveStartDate: "2026-07-31",
      effectiveEndDate: "2026-08-27",
    });
  });

  it("starts GSC incrementally and re-fetches the latest three days when caught up", () => {
    expect(
      resolveGscSyncRange({
        now: NOW,
        lastCompleteDate: "2026-08-26",
      }).effectiveStartDate,
    ).toBe("2026-08-27");
    expect(
      resolveGscSyncRange({
        now: NOW,
        lastCompleteDate: "2026-08-27",
      }).effectiveStartDate,
    ).toBe("2026-08-25");
  });

  it("uses the Los Angeles calendar across UTC and DST boundaries", () => {
    expect(
      resolveGscSyncRange({
        now: new Date("2026-08-31T01:00:00.000Z"),
        lastCompleteDate: null,
      }).effectiveEndDate,
    ).toBe("2026-08-27");
    expect(
      resolveGscSyncRange({
        now: new Date("2026-03-08T07:30:00.000Z"),
        lastCompleteDate: null,
      }).effectiveEndDate,
    ).toBe("2026-03-04");
    expect(
      resolveGscSyncRange({
        now: new Date("2026-03-08T08:30:00.000Z"),
        lastCompleteDate: null,
      }).effectiveEndDate,
    ).toBe("2026-03-05");
  });

  it("enforces GSC's 16-month floor and 90-day manual limit", () => {
    expect(() =>
      resolveGscSyncRange({
        now: NOW,
        lastCompleteDate: null,
        startDate: "2025-04-29",
        endDate: "2025-05-01",
      }),
    ).toThrow(ConnectorDatePolicyError);
    expect(() =>
      resolveGscSyncRange({
        now: NOW,
        lastCompleteDate: null,
        startDate: "2026-01-01",
        endDate: "2026-04-01",
      }),
    ).toThrow("cannot exceed 90 days");
  });

  it("clamps the GSC 16-month floor to the target month's last day", () => {
    const august31 = new Date("2026-08-31T23:00:00.000Z");
    expect(
      resolveGscSyncRange({
        now: august31,
        lastCompleteDate: null,
        startDate: "2025-04-30",
        endDate: "2025-05-01",
      }),
    ).toMatchObject({
      effectiveStartDate: "2025-04-30",
      effectiveEndDate: "2025-05-01",
    });
    expect(() =>
      resolveGscSyncRange({
        now: august31,
        lastCompleteDate: null,
        startDate: "2025-04-29",
        endDate: "2025-05-01",
      }),
    ).toThrow("within the last 16 months");
  });

  it("uses complete GA4 property-timezone days and re-fetches corrections", () => {
    expect(
      resolveGa4SyncRange({
        now: NOW,
        propertyTimeZone: "America/Los_Angeles",
        lastCompleteDate: null,
      }),
    ).toMatchObject({
      effectiveStartDate: "2026-08-02",
      effectiveEndDate: "2026-08-29",
    });
    expect(
      resolveGa4SyncRange({
        now: NOW,
        propertyTimeZone: "America/Los_Angeles",
        lastCompleteDate: "2026-08-29",
      }).effectiveStartDate,
    ).toBe("2026-08-27");
  });

  it("requires both explicit dates and complete GA4 days", () => {
    expect(() =>
      resolveGa4SyncRange({
        now: NOW,
        propertyTimeZone: "UTC",
        lastCompleteDate: null,
        startDate: "2026-08-01",
      }),
    ).toThrow("both startDate and endDate");
    expect(() =>
      resolveGa4SyncRange({
        now: NOW,
        propertyTimeZone: "UTC",
        lastCompleteDate: null,
        startDate: "2026-08-31",
        endDate: "2026-08-31",
      }),
    ).toThrow("complete provider day");
  });
});
