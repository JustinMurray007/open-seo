import { describe, expect, it } from "vitest";
import {
  cleanDisplayUrl,
  formatCtr,
  formatNumber,
  formatPosition,
  formatScore,
  formatStatusCode,
  getScoreColorClass,
  getStatusCodeBadgeClass,
} from "./page360Utils";

describe("page360Utils", () => {
  it("formats status codes accurately", () => {
    expect(formatStatusCode(200)).toBe("200 OK");
    expect(formatStatusCode(301)).toBe("301 Permanent Redirect");
    expect(formatStatusCode(404)).toBe("404 Not Found");
    expect(formatStatusCode(null)).toBe("Not Audited");
    expect(formatStatusCode(999)).toBe("999 Status");
  });

  it("assigns appropriate badge classes for HTTP status codes", () => {
    expect(getStatusCodeBadgeClass(200)).toContain("badge-success");
    expect(getStatusCodeBadgeClass(301)).toContain("badge-warning");
    expect(getStatusCodeBadgeClass(404)).toContain("badge-error");
    expect(getStatusCodeBadgeClass(500)).toContain("badge-error");
    expect(getStatusCodeBadgeClass(null)).toContain("badge-ghost");
  });

  it("formats numbers and CTR percentages", () => {
    expect(formatNumber(1500)).toBe("1,500");
    expect(formatNumber(null)).toBe("—");
    expect(formatCtr(0.0456)).toBe("4.6%");
    expect(formatCtr(null)).toBe("—");
    expect(formatPosition(3.2)).toBe("3.2");
    expect(formatPosition(0)).toBe("—");
    expect(formatPosition(null)).toBe("—");
  });

  it("formats scores and color classes", () => {
    expect(formatScore(94.2)).toBe("94");
    expect(formatScore(null)).toBe("—");
    expect(getScoreColorClass(95)).toBe("text-success");
    expect(getScoreColorClass(72)).toBe("text-warning");
    expect(getScoreColorClass(35)).toBe("text-error");
    expect(getScoreColorClass(null)).toBe("text-base-content/40");
  });

  it("cleans display URLs", () => {
    expect(cleanDisplayUrl("https://www.example.com/page")).toBe(
      "example.com/page",
    );
    expect(cleanDisplayUrl("http://sub.domain.com/path/")).toBe(
      "sub.domain.com/path/",
    );
  });
});
