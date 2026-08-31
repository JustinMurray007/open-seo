import { z } from "zod";
import {
  Ga4AdminApiError,
  Ga4DataApiError,
  Ga4MalformedResponseError,
  Ga4TokenError,
} from "@/server/lib/ga4Errors";
import { GscApiError, GscTokenError } from "@/server/lib/gscErrors";
import { ConnectorDatePolicyError } from "./datePolicy";
import {
  ConnectorImportValidationError,
  ConnectorInvocationLimitError,
} from "./types";

export type ConnectorSyncError = {
  code: string;
  message: string;
  retryAt: Date | null;
  retryable: boolean;
};

function retryDate(now: Date, seconds: number): Date {
  return new Date(now.valueOf() + seconds * 1_000);
}

export function classifyConnectorSyncError(
  error: unknown,
  now: Date,
): ConnectorSyncError {
  if (
    error instanceof ConnectorDatePolicyError ||
    error instanceof ConnectorImportValidationError ||
    error instanceof z.ZodError
  ) {
    return {
      code: "validation_error",
      message: "The requested connector date range is invalid.",
      retryAt: null,
      retryable: false,
    };
  }
  if (error instanceof GscTokenError || error instanceof Ga4TokenError) {
    return {
      code: "connection_expired",
      message:
        "The Google connection expired or was revoked. Reconnect it and try again.",
      retryAt: null,
      retryable: false,
    };
  }
  if (
    (error instanceof GscApiError ||
      error instanceof Ga4DataApiError ||
      error instanceof Ga4AdminApiError) &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  ) {
    return {
      code: "access_denied",
      message: "Google no longer allows access to the selected property.",
      retryAt: null,
      retryable: false,
    };
  }
  if (
    (error instanceof GscApiError ||
      error instanceof Ga4DataApiError ||
      error instanceof Ga4AdminApiError) &&
    error.status === 400
  ) {
    return {
      code: "validation_error",
      message: "Google rejected the requested connector report.",
      retryAt: null,
      retryable: false,
    };
  }
  if (
    (error instanceof GscApiError ||
      error instanceof Ga4DataApiError ||
      error instanceof Ga4AdminApiError) &&
    error.status === 429
  ) {
    const seconds =
      error instanceof Ga4DataApiError && error.retryAfterSeconds
        ? error.retryAfterSeconds
        : 900;
    return {
      code: "rate_limited",
      message:
        "Google's reporting limit was reached. The sync will retry later.",
      retryAt: retryDate(now, seconds),
      retryable: true,
    };
  }
  if (error instanceof Ga4MalformedResponseError) {
    return {
      code: "invalid_response",
      message: "Google returned an invalid reporting response.",
      retryAt: retryDate(now, 3_600),
      retryable: true,
    };
  }
  if (error instanceof ConnectorInvocationLimitError) {
    return {
      code: "invocation_limit",
      message:
        "The connector sync reached its safe execution bound and will resume later.",
      retryAt: retryDate(now, 300),
      retryable: true,
    };
  }
  return {
    code: "upstream_unavailable",
    message:
      "The provider is temporarily unavailable. The sync will retry later.",
    retryAt: retryDate(now, 3_600),
    retryable: true,
  };
}
