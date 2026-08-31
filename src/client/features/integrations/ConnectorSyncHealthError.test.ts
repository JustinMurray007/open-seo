import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConnectorSyncHealthError } from "./ConnectorSyncHealthError";

describe("ConnectorSyncHealthError", () => {
  it("renders an accessible recoverable state with a stable retry hook", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectorSyncHealthError, {
        provider: "gsc",
        retry: vi.fn(),
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="connector-sync-health-error-gsc"');
    expect(html).toContain('data-testid="button-retry-sync-health-gsc"');
    expect(html).toContain("Sync health unavailable");
    expect(html).toContain(">Retry<");
  });
});
