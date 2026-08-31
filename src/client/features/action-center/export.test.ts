import { describe, expect, it } from "vitest";
import { actionsToCsv, actionsToMarkdown } from "./export";

const action = {
  status: "open",
  severity: "critical",
  title: 'Fix "missing" titles',
  reason: "Pages need titles.",
  affectedPageCount: 2,
  notes: "Start with landing pages",
  firstSeenAt: "2026-08-29T00:00:00.000Z",
  lastSeenAt: "2026-08-30T00:00:00.000Z",
  evidence: [{ url: "https://example.com/a" }],
};

describe("Action Center exports", () => {
  it("builds escaped CSV", () => {
    const csv = actionsToCsv([action]);
    expect(csv).toContain('"Fix ""missing"" titles"');
    expect(csv).toContain("https://example.com/a");
  });

  it("builds readable Markdown", () => {
    const markdown = actionsToMarkdown([action]);
    expect(markdown).toContain("# SEO Action Center");
    expect(markdown).toContain('## Fix "missing" titles');
    expect(markdown).toContain("**Affected pages:** 2");
  });
});
