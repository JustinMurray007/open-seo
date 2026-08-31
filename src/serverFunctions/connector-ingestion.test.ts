import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("connector ingestion server functions", () => {
  it("keeps every operation behind project authorization middleware", () => {
    const source = readFileSync(
      "src/serverFunctions/connector-ingestion.ts",
      "utf8",
    );
    expect(source.match(/\.middleware\(requireProjectContext\)/g)).toHaveLength(
      3,
    );
  });

  it("caps operational history requests", () => {
    const source = readFileSync(
      "src/serverFunctions/connector-ingestion.ts",
      "utf8",
    );
    expect(source).toContain(".max(50)");
  });
});
