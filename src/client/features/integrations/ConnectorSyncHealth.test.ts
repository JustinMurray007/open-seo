import { describe, expect, it } from "vitest";
import {
  connectorHealthPollInterval,
  formatConnectorDate,
  formatConnectorTimestamp,
} from "./connectorSyncFormatting";

describe("connector sync health formatting", () => {
  it("formats empty values without exposing implementation details", () => {
    expect(formatConnectorDate(null)).toBe("No data yet");
    expect(formatConnectorTimestamp(null)).toBe("Never");
  });

  it("handles malformed values", () => {
    expect(formatConnectorDate("bad")).toBe("Unknown");
    expect(formatConnectorTimestamp("bad")).toBe("Unknown");
  });
});

describe("connector sync health polling", () => {
  it("polls only while a sync is running", () => {
    expect(connectorHealthPollInterval("syncing")).toBe(2_000);
    expect(connectorHealthPollInterval("healthy")).toBe(false);
    expect(connectorHealthPollInterval("error")).toBe(false);
    expect(connectorHealthPollInterval(undefined)).toBe(false);
  });
});
